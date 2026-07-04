import type { Result, AppError, Clock } from "@oxford/core";
import { ok, err, newId, asId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  Prescription,
  PrescriptionItem,
  PrescriptionItemInput,
  PrescriptionStatus,
  TheatreDrugInput,
  TheatreDrugItem,
  StockAllocation,
  TheatreDrugAdministration,
} from "./types.js";
import type { PharmacyStore } from "./store.js";
import type { FormularyPort, AllergyPort, InventoryPort, ControlledRegisterPort } from "./ports.js";
import {
  nextStatus,
  validatePrescriptionItems,
  screenPrescription,
  validateTheatreDrugs,
  controlledDrugItems,
  assertColdChainHandled,
  assertWitnessForControlled,
  assertSufficientStock,
  type PrescriptionAction,
} from "./administration.js";

export interface RaisePrescriptionInput {
  readonly patientId: string;
  /** The discharge encounter this script belongs to (the L2 gate case), if any. */
  readonly encounterId?: string;
  readonly items: readonly PrescriptionItemInput[];
}

export interface RecordExternalFulfilmentInput {
  readonly prescriptionId: string;
  /** The external pharmacy's reference for the handover, if provided. */
  readonly externalRef?: string;
  /** An optional non-clinical note captured at the handover confirmation. */
  readonly note?: string;
}

export interface AdministerTheatreDrugsInput {
  readonly encounterId: string;
  readonly patientId: string;
  readonly drugs: readonly TheatreDrugInput[];
  /** Required (second person) when any drug is controlled. */
  readonly witnessStaffId?: string;
  /** Must be asserted true when any drug is cold-chain. */
  readonly coldChainHandled?: boolean;
  /** The theatre stock location to draw from (defaults to config). */
  readonly locationId?: string;
  readonly administeredAt?: string;
}

export interface PharmacyConfig {
  /** Default in-house theatre stock location administrations draw from (ADR-0069). */
  readonly theatreStockLocationId: string;
}

/**
 * @oxford/pharmacy (ADR-0069 — supersedes the dispensing model of ADR-0066). Two
 * distinct flows:
 *
 *   (1) PRESCRIPTIONS (external fulfilment, NO clinic stock movement): a clinician
 *       raises a FORMULARY-ONLY prescription (allergy screened, advisory) →
 *       `issuePrescription` marks it issued (the printed script is the instrument) →
 *       `recordExternalFulfilment` is the audited handover confirmation recorded by
 *       ward/reception staff when the EXTERNAL Ground-floor pharmacy has supplied.
 *       `isPrescriptionFulfilled` implements the perioperative PharmacyPort so the L2
 *       discharge gate consumes the confirmation state. The queue read is the ward's
 *       outstanding-scripts tracker. No inventory or controlled-register writes.
 *
 *   (2) THEATRE DRUG ADMINISTRATION (the clinic's real in-house stock): the
 *       anaesthetic + controlled drugs used on L1 — `administerTheatreDrugs`
 *       decrements theatre stock (FEFO/lot via the inventory seam), requires a
 *       witness and posts witnessed movements to the controlled-drugs register for
 *       controlled items, and asserts cold-chain. Drugs validate against the
 *       COMPOSITE formulary (anaesthesia + stim).
 *
 * Every mutation is audited + emits a domain event.
 */
export class PharmacyService {
  constructor(
    private readonly store: PharmacyStore,
    /** Prescription formulary (stim-only source). */
    private readonly formulary: FormularyPort,
    /** Theatre-administration formulary (composite: anaesthesia + stim). */
    private readonly theatreFormulary: FormularyPort,
    private readonly allergy: AllergyPort,
    private readonly inventory: InventoryPort,
    private readonly controlled: ControlledRegisterPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    private readonly config: PharmacyConfig,
  ) {}

  // ── Prescription (formulary-only, allergy advisory, external fulfilment) ─────

  /** Raise a prescription. Every item MUST validate against the formulary — a
   *  non-formulary drug is rejected (there is no free-text item shape). The
   *  patient's allergies are screened at prescribe time (ADVISORY — never blocks;
   *  ADR-0060): matches are recorded on the prescription. Status starts `pending`. */
  async raisePrescription(actorId: string, input: RaisePrescriptionInput): Promise<Result<Prescription, AppError>> {
    const valid = validatePrescriptionItems(input.items);
    if (!valid.ok) return err(valid.error);

    const items: PrescriptionItem[] = [];
    for (const it of input.items) {
      if (!(await this.formulary.isPrescribable(it.drugId))) {
        return err(validationError("drug is not in the formulary", "pharmacy.rx.not_prescribable"));
      }
      const info = await this.formulary.drugInfo(it.drugId);
      if (info === null) {
        return err(validationError("drug is not in the formulary", "pharmacy.rx.not_prescribable"));
      }
      items.push({
        drugId: it.drugId,
        quantity: it.quantity,
        doseInstruction: it.doseInstruction,
        nameEn: info.nameEn,
        nameAr: info.nameAr,
        drugClass: info.drugClass,
        controlled: info.controlled ?? false,
        coldChain: info.coldChain ?? false,
      });
    }

    const allergicClasses = await this.allergy.allergicClasses(input.patientId);
    const warnings = screenPrescription(items, allergicClasses);
    const now = this.now();
    const prescription: Prescription = {
      id: newId<"Prescription">(),
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      prescriberId: actorId,
      items,
      status: "pending",
      allergyWarnings: warnings,
      externalRef: null,
      fulfilmentNote: null,
      cancelReason: null,
      raisedAt: now,
      updatedAt: now,
    };
    await this.store.savePrescription(prescription);
    await this.audit.record({
      actorId,
      entityType: "Prescription",
      entityId: prescription.id,
      action: "CREATE",
      after: { patientId: input.patientId, encounterId: prescription.encounterId, items: items.map((i) => ({ drugId: i.drugId, quantity: i.quantity })), allergyWarnings: warnings },
    });
    await this.events.emit({ type: "PrescriptionRaised", aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: input.patientId, encounterId: prescription.encounterId } });
    if (warnings.length > 0) {
      await this.events.emit({ type: "PrescriptionAllergyAdvisory", aggregateType: "Prescription", aggregateId: prescription.id, data: { warnings } });
    }
    return ok(prescription);
  }

  // ── Queue reads ─────────────────────────────────────────────────────────────

  /** The ward's outstanding-scripts queue (oldest first), optionally filtered. */
  queue(status?: PrescriptionStatus): Promise<readonly Prescription[]> {
    return this.store.listPrescriptions(status);
  }
  get(prescriptionId: string): Promise<Prescription | null> {
    return this.store.getPrescription(asId<"Prescription">(prescriptionId));
  }

  // ── Prescription status transitions (issue / fulfil / cancel) ───────────────

  /** Mark a pending prescription ISSUED — the printed script (print.prescription)
   *  is the instrument handed to the patient / external pharmacy. No stock moves. */
  issuePrescription(actorId: string, prescriptionId: string): Promise<Result<Prescription, AppError>> {
    return this.advance(actorId, prescriptionId, "issue", "PrescriptionIssued");
  }

  /** Record the EXTERNAL pharmacy's fulfilment — the audited handover confirmation
   *  recorded by ward/reception staff when the external pharmacy has supplied.
   *  NO inventory writes, NO controlled-register writes, NO cold-chain assertion. */
  async recordExternalFulfilment(actorId: string, input: RecordExternalFulfilmentInput): Promise<Result<Prescription, AppError>> {
    const prescription = await this.store.getPrescription(asId<"Prescription">(input.prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));
    const transition = nextStatus(prescription.status, "fulfil");
    if (!transition.ok) return err(transition.error);
    const externalRef = input.externalRef?.trim() ? input.externalRef.trim() : null;
    const fulfilmentNote = input.note?.trim() ? input.note.trim() : null;
    const updated: Prescription = { ...prescription, status: transition.value, externalRef, fulfilmentNote, updatedAt: this.now() };
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value, externalRef, fulfilmentNote } });
    await this.events.emit({ type: "PrescriptionFulfilled", aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: prescription.patientId, encounterId: prescription.encounterId, externalRef } });
    return ok(updated);
  }

  /** Cancel a prescription pre-fulfilment (pending or issued) with a reason. */
  async cancel(actorId: string, prescriptionId: string, reason: string): Promise<Result<Prescription, AppError>> {
    if (reason.trim() === "") return err(validationError("a cancellation reason is required", "pharmacy.cancel.reason_required"));
    const prescription = await this.store.getPrescription(asId<"Prescription">(prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));
    const transition = nextStatus(prescription.status, "cancel");
    if (!transition.ok) return err(transition.error);
    const updated: Prescription = { ...prescription, status: transition.value, cancelReason: reason, updatedAt: this.now() };
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value, cancelReason: reason } });
    await this.events.emit({ type: "PrescriptionCancelled", aggregateType: "Prescription", aggregateId: prescription.id, data: { reason } });
    return ok(updated);
  }

  // ── PharmacyPort (the L2 discharge gate) ────────────────────────────────────

  /** Has the discharge prescription for an encounter been fulfilled by the external
   *  pharmacy? True when at least one prescription is linked to the encounter AND
   *  every one of them is `fulfilled`. No prescription ⇒ false (mirrors the stub's
   *  semantics so the existing discharge e2e holds). */
  async isPrescriptionFulfilled(encounterId: string): Promise<boolean> {
    const list = await this.store.prescriptionsForEncounter(encounterId);
    if (list.length === 0) return false;
    return list.every((p) => p.status === "fulfilled");
  }

  // ── Theatre drug administration (in-house stock: FEFO + controlled + cold-chain) ─

  /** Administer the clinic's own in-house theatre drugs (anaesthetic + controlled,
   *  L1): validate each drug against the COMPOSITE formulary, FEFO-decrement theatre
   *  stock through the inventory seam (recording lot allocations), REQUIRE a witness
   *  when any drug is controlled (posting witnessed issue movements to the
   *  controlled-drugs register), and enforce the cold-chain assertion for cold-chain
   *  items. Insufficient stock leaves no partial decrement (typed domain error). */
  async administerTheatreDrugs(actorId: string, input: AdministerTheatreDrugsInput): Promise<Result<TheatreDrugAdministration, AppError>> {
    const valid = validateTheatreDrugs(input.drugs);
    if (!valid.ok) return err(valid.error);

    const items: TheatreDrugItem[] = [];
    for (const d of input.drugs) {
      if (!(await this.theatreFormulary.isPrescribable(d.drugId))) {
        return err(validationError("drug is not in the formulary", "pharmacy.admin.not_in_formulary"));
      }
      const info = await this.theatreFormulary.drugInfo(d.drugId);
      if (info === null) {
        return err(validationError("drug is not in the formulary", "pharmacy.admin.not_in_formulary"));
      }
      items.push({
        drugId: d.drugId,
        quantity: d.quantity,
        nameEn: info.nameEn,
        nameAr: info.nameAr,
        drugClass: info.drugClass,
        controlled: info.controlled ?? false,
        coldChain: info.coldChain ?? false,
      });
    }

    const coldChainHandled = input.coldChainHandled ?? false;
    const cold = assertColdChainHandled(items, coldChainHandled);
    if (!cold.ok) return err(cold.error);
    const witness = assertWitnessForControlled(items, input.witnessStaffId);
    if (!witness.ok) return err(witness.error);

    const locationId = input.locationId ?? this.config.theatreStockLocationId;
    const at = input.administeredAt ?? this.now();

    // Pre-flight sufficiency so a shortfall never partially decrements stock.
    const availableByDrug = new Map<string, number>();
    for (const item of items) availableByDrug.set(item.drugId, await this.inventory.availableAt(item.drugId, locationId));
    const sufficient = assertSufficientStock(items, availableByDrug);
    if (!sufficient.ok) return err(sufficient.error);

    const allocations: StockAllocation[] = [];
    for (const item of items) {
      const issued = await this.inventory.issueFefo(actorId, item.drugId, locationId, item.quantity);
      if (!issued.ok) return err(issued.error);
      allocations.push(...issued.value);
    }

    // Controlled items → a witnessed issue movement to the controlled-drugs
    // register, per consumed lot (the witness is guaranteed present above).
    for (const item of controlledDrugItems(items)) {
      for (const alloc of allocations.filter((a) => a.drugId === item.drugId)) {
        const posted = await this.controlled.postIssue(actorId, {
          drugId: item.drugId,
          lotNo: alloc.lotNo,
          quantity: alloc.quantity,
          patientRef: input.patientId,
          witnessStaffId: input.witnessStaffId!,
          occurredAt: at,
        });
        if (!posted.ok) return err(posted.error);
      }
    }

    const administration: TheatreDrugAdministration = {
      id: newId<"TheatreDrugAdministration">(),
      encounterId: input.encounterId,
      patientId: input.patientId,
      administeredBy: actorId,
      items,
      allocations,
      coldChainHandled,
      witnessStaffId: input.witnessStaffId ?? null,
      locationId,
      administeredAt: at,
    };
    await this.store.saveTheatreAdministration(administration);
    await this.audit.record({ actorId, entityType: "TheatreDrugAdministration", entityId: administration.id, action: "CREATE", after: { encounterId: input.encounterId, patientId: input.patientId, items: items.map((i) => ({ drugId: i.drugId, quantity: i.quantity })), allocations } });
    await this.events.emit({ type: "TheatreDrugsAdministered", aggregateType: "TheatreDrugAdministration", aggregateId: administration.id, data: { encounterId: input.encounterId, patientId: input.patientId } });
    return ok(administration);
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private async advance(actorId: string, prescriptionId: string, action: PrescriptionAction, eventType: string): Promise<Result<Prescription, AppError>> {
    const prescription = await this.store.getPrescription(asId<"Prescription">(prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));
    const transition = nextStatus(prescription.status, action);
    if (!transition.ok) return err(transition.error);
    const updated: Prescription = { ...prescription, status: transition.value, updatedAt: this.now() };
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value } });
    await this.events.emit({ type: eventType, aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: prescription.patientId } });
    return ok(updated);
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
