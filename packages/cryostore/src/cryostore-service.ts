import type { Result, AppError, Clock } from "@oxford/core";
import { ok, err, newId, conflict, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  CryoSpecimen,
  CryoSpecimenId,
  CryoPosition,
  CustodyEvent,
  CustodyEventType,
  EngagementState,
  SpecimenKind,
  SpecimenOwner,
  StorageConsent,
  Tank,
  TankReading,
  LnFill,
  LnConsumption,
  TankPpmStatus,
  DispositionReview,
  ReviewReason,
  ReviewOutcome,
} from "./types.js";
import type { CryostoreStore } from "./store.js";
import { positionKey } from "./store.js";
import type { WitnessPort, UseGate, BillingPort, StorageChargeLine, AssetPpmPort } from "./ports.js";
import { assertThawForTreatmentAllowed } from "./ownership.js";
import { computeExpiry, isExpired, expiresWithin } from "./storage-period.js";
import { nextEngagementState, type EngagementAction } from "./engagement.js";
import { assertResolveAllowed, outcomeRequiresDiscard } from "./disposition-review.js";

export interface FreezeInput {
  readonly kind: SpecimenKind;
  readonly owner: SpecimenOwner;
  readonly cycleId: string;
  readonly straws: number;
  readonly position: CryoPosition;
  readonly freezeEventRef: string;
  readonly patientId: string;
  readonly occurredAt: string;
}

/** Tank monitoring thresholds (configuration). LN2 vapour storage sits well below
 *  -150 °C; an alert fires if temperature rises above, or level drops below. */
export interface TankThresholds {
  readonly temperatureMaxC: number;
  readonly nitrogenLevelMinPct: number;
}
export const DEFAULT_TANK_THRESHOLDS: TankThresholds = { temperatureMaxC: -150, nitrogenLevelMinPct: 20 };

export interface ReadingResult {
  readonly reading: TankReading;
  readonly alert: boolean;
}
export interface SpecimenLocation {
  readonly specimen: CryoSpecimen;
  readonly custody: readonly CustodyEvent[];
}
export interface ExpiringConsent {
  readonly consent: StorageConsent;
  readonly expired: boolean;
}

/**
 * Cryostorage management. Owns tank topology, witnessed chain-of-custody, the
 * thaw-for-treatment re-gate (the ownership invariant), consent/expiry tracking,
 * tank monitoring, and the AMD-0003 annual billing + graduated non-engagement
 * pathway. Witnessing (RI Witness), registry facts, and billing are seams.
 */
export class CryostoreService {
  constructor(
    private readonly store: CryostoreStore,
    private readonly witness: WitnessPort,
    private readonly useGate: UseGate,
    private readonly billing: BillingPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    /** Asset seam for tank PPM linkage (docs/01 §E6 P2). Defaults to "no asset". */
    private readonly assetPpm: AssetPpmPort = { async ppmStatus() { return null; } },
  ) {}

  async registerTank(actorId: string, label: string, assetRef: string | null = null): Promise<Tank> {
    const tank: Tank = { id: newId<"Tank">(), label, assetRef };
    await this.store.saveTank(tank);
    await this.audit.record({ actorId, entityType: "Tank", entityId: tank.id, action: "CREATE", after: { label, assetRef } });
    return tank;
  }

  tanks(): Promise<readonly Tank[]> {
    return this.store.tanks();
  }

  /** Record an LN₂ top-up (litres added to refill the tank). LN₂ consumption is
   *  read back from these fills over a window. */
  async recordLnFill(actorId: string, tankId: string, litresAdded: number, filledAt: string): Promise<Result<LnFill, AppError>> {
    if (!(litresAdded > 0)) return err(validationError("litres added must be positive", "cryostore.ln_fill.bad_litres"));
    const tank = await this.store.getTank(tankId);
    if (tank === undefined) return err(notFound("tank not found", "cryostore.tank.not_found"));
    const fill: LnFill = { id: newId<"LnFill">(), tankId, litresAdded, filledAt, filledBy: actorId };
    await this.store.saveLnFill(fill);
    await this.audit.record({ actorId, entityType: "LnFill", entityId: fill.id, action: "CREATE", after: { tankId, litresAdded } });
    await this.events.emit({ type: "LnFillRecorded", aggregateType: "Tank", aggregateId: tankId, data: { litresAdded } });
    return ok(fill);
  }

  /** LN₂ consumed by a tank over [since, until] ≈ total litres refilled in the window. */
  async lnConsumption(tankId: string, since: string, until: string): Promise<LnConsumption> {
    const fills = await this.store.lnFillsForTank(tankId, since, until);
    const litres = fills.reduce((sum, f) => sum + f.litresAdded, 0);
    return { tankId, since, until, litres, fills: fills.length };
  }

  /** A tank's PPM status, resolved via its linked Asset (or unlinked → null fields). */
  async tankPpmStatus(tankId: string): Promise<Result<TankPpmStatus, AppError>> {
    const tank = await this.store.getTank(tankId);
    if (tank === undefined) return err(notFound("tank not found", "cryostore.tank.not_found"));
    if (tank.assetRef === null) return ok({ tankId, assetRef: null, nextDueDate: null, overdue: false });
    const ppm = await this.assetPpm.ppmStatus(tank.assetRef);
    return ok({ tankId, assetRef: tank.assetRef, nextDueDate: ppm?.nextDueDate ?? null, overdue: ppm?.overdue ?? false });
  }

  /** Freeze material into an addressable, unoccupied position (witnessed). */
  async freezeIntoStorage(actorId: string, input: FreezeInput): Promise<Result<CryoSpecimen, AppError>> {
    const occupied = await this.store.storedSpecimenAt(positionKey(input.position));
    if (occupied !== undefined) return err(conflict("storage position already occupied", "cryostore.position_occupied"));

    const id = newId<"CryoSpecimen">();
    const witnessKey = `${input.cycleId}:cryo.freeze:${id}`;
    const specimen: CryoSpecimen = {
      id,
      kind: input.kind,
      owner: input.owner,
      cycleId: input.cycleId,
      straws: input.straws,
      position: input.position,
      status: "stored",
      freezeEventRef: input.freezeEventRef,
      witnessKey,
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.saveSpecimen(specimen);
    await this.custodyEvent(actorId, specimen, "freeze", null, input.position, input.patientId, input.occurredAt);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: id, action: "CREATE", after: { kind: input.kind, owner: input.owner } });
    await this.events.emit({ type: "SpecimenFrozen", aggregateType: "CryoSpecimen", aggregateId: id, data: { kind: input.kind } });
    return ok(specimen);
  }

  /** Move a stored specimen to another unoccupied position (witnessed). */
  async move(actorId: string, specimenId: CryoSpecimenId, to: CryoPosition, patientId: string, occurredAt: string): Promise<Result<CryoSpecimen, AppError>> {
    const specimen = await this.store.specimenById(specimenId);
    if (specimen === undefined) return err(notFound("specimen not found", "cryostore.specimen.not_found"));
    if (specimen.status !== "stored") return err(conflict("specimen is not in storage", "cryostore.not_stored"));
    const occupied = await this.store.storedSpecimenAt(positionKey(to));
    if (occupied !== undefined) return err(conflict("storage position already occupied", "cryostore.position_occupied"));

    const from = specimen.position;
    const moved: CryoSpecimen = { ...specimen, position: to };
    await this.store.saveSpecimen(moved);
    await this.custodyEvent(actorId, moved, "move", from, to, patientId, occurredAt);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: specimenId, action: "UPDATE", before: { position: from }, after: { position: to } });
    return ok(moved);
  }

  /**
   * Thaw a specimen for treatment. THE OWNERSHIP RE-GATE: person-owned material
   * requires a verified couple that includes the living owner, using own gametes;
   * no posthumous-use pathway. Facts come from the registry seam, not the caller.
   */
  async thawForTreatment(actorId: string, specimenId: CryoSpecimenId, coupleId: string, patientId: string, occurredAt: string): Promise<Result<CryoSpecimen, AppError>> {
    const specimen = await this.store.specimenById(specimenId);
    if (specimen === undefined) return err(notFound("specimen not found", "cryostore.specimen.not_found"));
    const facts = await this.useGate.thawFacts(specimen.owner, coupleId);
    const gate = assertThawForTreatmentAllowed(specimen, coupleId, facts);
    if (!gate.ok) return err(gate.error);

    const thawed: CryoSpecimen = { ...specimen, status: "thawed" };
    await this.store.saveSpecimen(thawed);
    await this.custodyEvent(actorId, thawed, "thaw", specimen.position, null, patientId, occurredAt);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: specimenId, action: "UPDATE", before: { status: "stored" }, after: { status: "thawed", coupleId } });
    await this.events.emit({ type: "SpecimenThawed", aggregateType: "CryoSpecimen", aggregateId: specimenId, data: { coupleId } });
    return ok(thawed);
  }

  /** Discard a specimen — a witnessed, audited human clinical act. NEVER invoked
   *  automatically by the non-payment pathway. */
  async discard(actorId: string, specimenId: CryoSpecimenId, reason: string, patientId: string, occurredAt: string): Promise<Result<CryoSpecimen, AppError>> {
    const specimen = await this.store.specimenById(specimenId);
    if (specimen === undefined) return err(notFound("specimen not found", "cryostore.specimen.not_found"));
    if (specimen.status !== "stored") return err(conflict("specimen is not in storage", "cryostore.not_stored"));
    const discarded: CryoSpecimen = { ...specimen, status: "discarded" };
    await this.store.saveSpecimen(discarded);
    await this.custodyEvent(actorId, discarded, "discard", specimen.position, null, patientId, occurredAt);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: specimenId, action: "SOFT_DELETE", before: { status: "stored" }, after: { status: "discarded", reason } });
    await this.events.emit({ type: "SpecimenDiscarded", aggregateType: "CryoSpecimen", aggregateId: specimenId, data: { reason } });
    return ok(discarded);
  }

  private async custodyEvent(actorId: string, specimen: CryoSpecimen, type: CustodyEventType, from: CryoPosition | null, to: CryoPosition | null, patientId: string, occurredAt: string): Promise<void> {
    const witnessKey = `${specimen.cycleId}:cryo.${type}:${specimen.id}`;
    const event: CustodyEvent = {
      id: newId<"CustodyEvent">(),
      specimenId: specimen.id,
      type,
      fromPosition: from,
      toPosition: to,
      occurredAt,
      operator: actorId,
      witnessKey,
    };
    await this.store.saveCustodyEvent(event);
    await this.witness.registerHandlingEvent(actorId, {
      cycleId: specimen.cycleId,
      stepKey: `cryo.${type}`,
      oxfordKey: witnessKey,
      patientId,
      sampleId: specimen.id,
      occurredAt,
    });
  }

  // ---- consent / expiry ----
  async recordStorageConsent(actorId: string, specimenId: CryoSpecimenId, consentedAt: string, storageYears: number): Promise<StorageConsent> {
    const consent: StorageConsent = {
      id: newId<"StorageConsent">(),
      specimenId,
      consentedAt,
      expiresAt: computeExpiry(consentedAt, storageYears),
      renewedAt: null,
    };
    await this.store.saveConsent(consent);
    await this.audit.record({ actorId, entityType: "StorageConsent", entityId: consent.id, action: "CREATE", after: { specimenId, expiresAt: consent.expiresAt } });
    return consent;
  }

  /** Consents expired or due within `withinDays` (renewal/expiry alert list). */
  async expiringConsents(asOf: Date, withinDays: number): Promise<readonly ExpiringConsent[]> {
    const all = await this.store.activeConsents();
    const out: ExpiringConsent[] = [];
    for (const consent of all) {
      const expired = isExpired(consent, asOf);
      if (expired || expiresWithin(consent, asOf, withinDays)) out.push({ consent, expired });
    }
    return out;
  }

  // ---- tank monitoring ----
  async recordTankReading(actorId: string, tankId: string, temperatureC: number, nitrogenLevelPct: number, recordedAt: string, thresholds: TankThresholds = DEFAULT_TANK_THRESHOLDS): Promise<ReadingResult> {
    const reading: TankReading = { id: newId<"TankReading">(), tankId, temperatureC, nitrogenLevelPct, recordedAt };
    await this.store.saveReading(reading);
    const alert = temperatureC > thresholds.temperatureMaxC || nitrogenLevelPct < thresholds.nitrogenLevelMinPct;
    await this.audit.record({ actorId, entityType: "TankReading", entityId: reading.id, action: "CREATE", after: { tankId, alert } });
    if (alert) {
      await this.events.emit({ type: "TankAlert", aggregateType: "Tank", aggregateId: tankId, data: { temperatureC, nitrogenLevelPct } });
    }
    return { reading, alert };
  }

  // ---- AMD-0003: annual billing + non-engagement pathway ----
  /** Raise the recurring annual storage charge via the billing seam. */
  async raiseAnnualStorageCharge(actorId: string, specimenId: CryoSpecimenId, patientId: string, line: StorageChargeLine): Promise<Result<{ invoiceId: string }, AppError>> {
    const specimen = await this.store.specimenById(specimenId);
    if (specimen === undefined) return err(notFound("specimen not found", "cryostore.specimen.not_found"));
    const invoiceId = await this.billing.raiseStorageCharge(actorId, patientId, line);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: specimenId, action: "UPDATE", after: { storageInvoiceId: invoiceId } });
    await this.events.emit({ type: "StorageChargeRaised", aggregateType: "CryoSpecimen", aggregateId: specimenId, data: { invoiceId } });
    return ok({ invoiceId });
  }

  /** Advance the graduated non-engagement pathway. Never destroys a specimen. */
  async advanceEngagement(actorId: string, specimenId: CryoSpecimenId, action: EngagementAction): Promise<Result<EngagementState, AppError>> {
    const current = await this.store.engagementFor(specimenId);
    const next = nextEngagementState(current, action);
    if (!next.ok) return err(next.error);
    await this.store.saveEngagement(specimenId, next.value);
    await this.audit.record({ actorId, entityType: "CryoSpecimen", entityId: specimenId, action: "UPDATE", before: { engagement: current }, after: { engagement: next.value } });
    if (next.value === "in_legal_review") {
      await this.events.emit({ type: "StorageNonEngagementEscalated", aggregateType: "CryoSpecimen", aggregateId: specimenId, data: { state: next.value } });
    }
    return ok(next.value);
  }

  engagementState(specimenId: CryoSpecimenId): Promise<EngagementState> {
    return this.store.engagementFor(specimenId);
  }

  // ---- reads: "locate any specimen" / "list everything for this owner" ----
  async locate(specimenId: CryoSpecimenId): Promise<Result<SpecimenLocation, AppError>> {
    const specimen = await this.store.specimenById(specimenId);
    if (specimen === undefined) return err(notFound("specimen not found", "cryostore.specimen.not_found"));
    return ok({ specimen, custody: await this.store.custodyForSpecimen(specimenId) });
  }

  listForOwner(owner: SpecimenOwner): Promise<readonly CryoSpecimen[]> {
    return this.store.specimensForOwner(owner.kind, owner.id);
  }

  consentFor(specimenId: CryoSpecimenId): Promise<StorageConsent | undefined> {
    return this.store.consentForSpecimen(specimenId);
  }

  tankReadings(tankId: string): Promise<readonly TankReading[]> {
    return this.store.readingsForTank(tankId);
  }

  // ---- AMD-0004: marital-status-change disposition review ----
  /**
   * Open a disposition review over every STORED specimen of an owner (e.g. on a
   * couple dissolution). Idempotent per specimen — an already-open review is left
   * as-is. Opening a review NEVER changes a specimen's status; disposition is a
   * separate reviewed human decision.
   */
  async openDispositionReview(actorId: string, owner: SpecimenOwner, reason: ReviewReason): Promise<readonly DispositionReview[]> {
    const specimens = await this.store.specimensForOwner(owner.kind, owner.id);
    const opened: DispositionReview[] = [];
    for (const specimen of specimens) {
      if (specimen.status !== "stored") continue;
      if ((await this.store.openReviewForSpecimen(specimen.id)) !== undefined) continue;
      const review: DispositionReview = {
        id: newId<"DispositionReview">(),
        specimenId: specimen.id,
        reason,
        state: "open",
        outcome: null,
        rationale: null,
        openedBy: actorId,
        openedAt: this.clock.now().toISOString(),
        resolvedBy: null,
        resolvedAt: null,
      };
      await this.store.saveReview(review);
      await this.audit.record({ actorId, entityType: "DispositionReview", entityId: review.id, action: "CREATE", after: { specimenId: specimen.id, reason } });
      opened.push(review);
    }
    await this.events.emit({ type: "DispositionReviewOpened", aggregateType: "CryoSpecimen", aggregateId: owner.id, data: { reason, count: opened.length } });
    return opened;
  }

  /**
   * Resolve a disposition review with an explicit human decision + rationale.
   * `retain` keeps the specimen in storage; `discard` routes through the
   * witnessed, audited discard. There is no automatic resolution.
   */
  async resolveDispositionReview(
    actorId: string,
    specimenId: CryoSpecimenId,
    outcome: ReviewOutcome,
    rationale: string,
    patientId: string,
    occurredAt: string,
  ): Promise<Result<DispositionReview, AppError>> {
    const review = await this.store.openReviewForSpecimen(specimenId);
    if (review === undefined) return err(notFound("no open disposition review for this specimen", "cryostore.review.not_open"));
    const allowed = assertResolveAllowed(review, rationale);
    if (!allowed.ok) return err(allowed.error);
    if (outcomeRequiresDiscard(outcome)) {
      const discarded = await this.discard(actorId, specimenId, `disposition review: ${rationale}`, patientId, occurredAt);
      if (!discarded.ok) return err(discarded.error);
    }
    const resolved: DispositionReview = { ...review, state: "resolved", outcome, rationale, resolvedBy: actorId, resolvedAt: this.clock.now().toISOString() };
    await this.store.saveReview(resolved);
    await this.audit.record({ actorId, entityType: "DispositionReview", entityId: review.id, action: "UPDATE", before: { state: "open" }, after: { state: "resolved", outcome } });
    await this.events.emit({ type: "DispositionReviewResolved", aggregateType: "CryoSpecimen", aggregateId: specimenId, data: { outcome } });
    return ok(resolved);
  }

  openReview(specimenId: CryoSpecimenId): Promise<DispositionReview | undefined> {
    return this.store.openReviewForSpecimen(specimenId);
  }
  reviewHistory(specimenId: CryoSpecimenId): Promise<readonly DispositionReview[]> {
    return this.store.reviewsForSpecimen(specimenId);
  }
}
