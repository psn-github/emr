import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertAdvance } from "./lifecycle.js";
import { assertConsentsComplete } from "./consent.js";
import type { FertilityGate } from "./gate.js";
import type { CohortFilter, CycleStore } from "./store.js";
import type { ReasonCodeStore } from "./reason-codes.js";
import { InMemoryCycleTemplateStore, type CycleTemplate, type CycleTemplateStore } from "./cycle-template.js";
import { PERSON_SCOPED_TYPES, type Cycle, type CycleId, type CycleOwner, type CycleStatus, type CycleType } from "./types.js";

/** Statuses a cycle can be converted from — before retrieval, while a change of
 *  approach (e.g. IVF→IUI on poor response) is still clinically meaningful. */
const CONVERTIBLE_STATUSES: ReadonlySet<CycleStatus> = new Set<CycleStatus>(["planned", "stimulating"]);

/** The source + the newly created cycle produced by a conversion. */
export interface ConversionResult {
  readonly source: Cycle;
  readonly created: Cycle;
}

/**
 * Cycle engine. Treatment/embryo-creation cycles are couple-scoped and pass the
 * marriage hard-gate (via the injected FertilityGate); fertility-preservation is
 * person-scoped and needs no couple (ADR-0015). Progression out of `planned` is
 * blocked until required consents are signed. Cancellation/conversion reasons are
 * CODED (config, never free text) so KPIs can aggregate. Every mutation is audited.
 */
export class CycleService {
  constructor(
    private readonly store: CycleStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    private readonly gate: FertilityGate,
    private readonly reasons: ReasonCodeStore,
    private readonly templates: CycleTemplateStore = new InMemoryCycleTemplateStore(),
  ) {}

  /** Templates available to a consultant (their own + clinic-wide), for one-step starts. */
  listTemplates(staffId: string): Promise<readonly CycleTemplate[]> {
    return this.templates.listFor(staffId);
  }

  /** Start a cycle from a consultant template (applies its type + protocol). The owner
   *  must match the template's scope: person for preservation, couple otherwise. */
  async createCycleFromTemplate(actorId: string, templateId: string, owner: CycleOwner): Promise<Result<Cycle, AppError>> {
    const t = await this.templates.get(templateId);
    if (t === null || !t.active) return err(validationError(`unknown or inactive cycle template '${templateId}'`, "fertility.template.unknown"));
    if (PERSON_SCOPED_TYPES.has(t.cycleType)) {
      if (owner.kind !== "person") return err(validationError("a preservation template needs a person owner", "fertility.template.owner_mismatch"));
      return ok(await this.persist(actorId, t.cycleType, owner, t.protocolId ?? undefined));
    }
    if (owner.kind !== "couple") return err(validationError("a treatment template needs a couple owner", "fertility.template.owner_mismatch"));
    return this.createTreatmentCycle(actorId, t.cycleType, owner.coupleId, t.protocolId ?? undefined);
  }

  /** Bulk cohort view for clinicians (e.g. "all patients stimulating this week"). */
  cohort(filter: CohortFilter): Promise<readonly Cycle[]> {
    return this.store.cohort(filter);
  }

  /** Create a treatment cycle — requires a verified couple (marriage gate). */
  async createTreatmentCycle(actorId: string, type: CycleType, coupleId: string, protocolId?: string): Promise<Result<Cycle, AppError>> {
    if (PERSON_SCOPED_TYPES.has(type)) {
      return err(validationError("fertility preservation is person-scoped — use createPreservationCycle", "fertility.preservation_is_person_scoped"));
    }
    const allowed = await this.gate.assertMayTreat(coupleId);
    if (!allowed.ok) return err(allowed.error); // marriage hard-gate
    return ok(await this.persist(actorId, type, { kind: "couple", coupleId }, protocolId));
  }

  /** Create a fertility-preservation cycle — person-scoped, no marriage gate. */
  async createPreservationCycle(actorId: string, personId: string, protocolId?: string): Promise<Cycle> {
    return this.persist(actorId, "fertility_preservation", { kind: "person", personId }, protocolId);
  }

  private async persist(actorId: string, type: CycleType, owner: Cycle["owner"], protocolId?: string): Promise<Cycle> {
    const cycle: Cycle = {
      id: newId<"Cycle">(),
      type,
      owner,
      protocolId: protocolId ?? null,
      status: "planned",
      signedConsents: [],
      cancellationReasonCode: null,
      cancellationCategory: null,
      cancellationNote: null,
      convertedFromId: null,
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.save(cycle);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: cycle.id, action: "CREATE", after: { type, owner } });
    await this.events.emit({ type: "CycleCreated", aggregateType: "Cycle", aggregateId: cycle.id, data: { type } });
    return cycle;
  }

  async recordConsent(actorId: string, id: CycleId, consentKey: string): Promise<Result<Cycle, AppError>> {
    const cycle = await this.store.get(id);
    if (cycle === null) return err(notFound("cycle not found", "fertility.cycle.not_found"));
    if (cycle.signedConsents.includes(consentKey)) return ok(cycle); // idempotent
    const updated: Cycle = { ...cycle, signedConsents: [...cycle.signedConsents, consentKey] };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: id, action: "UPDATE", before: { consents: cycle.signedConsents.length }, after: { consents: updated.signedConsents.length } });
    return ok(updated);
  }

  /** Advance the cycle. Leaving `planned` requires complete consents. */
  async advanceStatus(actorId: string, id: CycleId, to: CycleStatus): Promise<Result<Cycle, AppError>> {
    const cycle = await this.store.get(id);
    if (cycle === null) return err(notFound("cycle not found", "fertility.cycle.not_found"));
    const transition = assertAdvance(cycle.status, to);
    if (!transition.ok) return err(transition.error);
    if (cycle.status === "planned" && to !== "cancelled") {
      const consents = assertConsentsComplete(cycle.type, cycle.signedConsents);
      if (!consents.ok) return err(consents.error);
    }
    const updated: Cycle = { ...cycle, status: to };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: id, action: "UPDATE", before: { status: cycle.status }, after: { status: to } });
    await this.events.emit({ type: "CycleStatusChanged", aggregateType: "Cycle", aggregateId: id, data: { from: cycle.status, to } });
    return ok(updated);
  }

  /** Cancel a cycle with a CODED reason (config, never free text). An optional free-text
   *  note may accompany it. A `converted`-category reason is rejected — use convertCycle. */
  async cancel(actorId: string, id: CycleId, reasonCode: string, note?: string): Promise<Result<Cycle, AppError>> {
    const cycle = await this.store.get(id);
    if (cycle === null) return err(notFound("cycle not found", "fertility.cycle.not_found"));
    const transition = assertAdvance(cycle.status, "cancelled");
    if (!transition.ok) return err(transition.error);
    const reason = await this.reasons.get(reasonCode);
    if (reason === null || !reason.active) return err(validationError(`unknown or inactive cancellation reason '${reasonCode}'`, "fertility.cancellation.unknown_reason"));
    if (reason.category === "converted") return err(validationError("a conversion reason must be applied via convertCycle, not cancel", "fertility.cancellation.use_convert"));
    const updated: Cycle = { ...cycle, status: "cancelled", cancellationReasonCode: reason.code, cancellationCategory: reason.category, cancellationNote: note ?? null };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: id, action: "UPDATE", before: { status: cycle.status }, after: { status: "cancelled", reasonCode: reason.code, category: reason.category } });
    await this.events.emit({ type: "CycleCancelled", aggregateType: "Cycle", aggregateId: id, data: { reasonCode: reason.code, category: reason.category } });
    return ok(updated);
  }

  /** Convert a cycle to a different treatment type (e.g. IVF→IUI). The source cycle is
   *  cancelled with a `converted`-category reason and a NEW linked cycle of `toType` is
   *  created (carrying owner + signed consents), so KPIs can track the conversion rate
   *  distinctly from true cancellations. Only allowed pre-retrieval, between treatment
   *  types (never to/from person-scoped preservation), and to a different type. */
  async convertCycle(actorId: string, id: CycleId, toType: CycleType, reasonCode: string, note?: string): Promise<Result<ConversionResult, AppError>> {
    const cycle = await this.store.get(id);
    if (cycle === null) return err(notFound("cycle not found", "fertility.cycle.not_found"));
    if (!CONVERTIBLE_STATUSES.has(cycle.status)) return err(validationError(`cycle in '${cycle.status}' cannot be converted (pre-retrieval only)`, "fertility.convert.not_convertible"));
    if (PERSON_SCOPED_TYPES.has(cycle.type) || PERSON_SCOPED_TYPES.has(toType)) return err(validationError("preservation cycles cannot be converted", "fertility.convert.preservation_not_convertible"));
    if (toType === cycle.type) return err(validationError("conversion target must differ from the current type", "fertility.convert.same_type"));
    const reason = await this.reasons.get(reasonCode);
    if (reason === null || !reason.active) return err(validationError(`unknown or inactive cancellation reason '${reasonCode}'`, "fertility.cancellation.unknown_reason"));
    if (reason.category !== "converted") return err(validationError("convertCycle requires a conversion-category reason", "fertility.convert.reason_not_conversion"));

    const source: Cycle = { ...cycle, status: "cancelled", cancellationReasonCode: reason.code, cancellationCategory: reason.category, cancellationNote: note ?? null };
    const created: Cycle = {
      id: newId<"Cycle">(),
      type: toType,
      owner: cycle.owner,
      protocolId: null, // a new approach needs its own protocol selection
      status: "planned",
      signedConsents: [...cycle.signedConsents],
      cancellationReasonCode: null,
      cancellationCategory: null,
      cancellationNote: null,
      convertedFromId: cycle.id,
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.save(source);
    await this.store.save(created);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: id, action: "UPDATE", before: { status: cycle.status, type: cycle.type }, after: { status: "cancelled", convertedToId: created.id, reasonCode: reason.code } });
    await this.audit.record({ actorId, entityType: "Cycle", entityId: created.id, action: "CREATE", after: { type: toType, convertedFromId: cycle.id } });
    await this.events.emit({ type: "CycleConverted", aggregateType: "Cycle", aggregateId: id, data: { fromId: cycle.id, toId: created.id, fromType: cycle.type, toType, reasonCode: reason.code } });
    return ok({ source, created });
  }

  /** Disposition counts (cancellation/conversion) for the KPI read-model. */
  dispositionCounts(): ReturnType<CycleStore["dispositionCounts"]> {
    return this.store.dispositionCounts();
  }

  get(id: CycleId): Promise<Cycle | null> {
    return this.store.get(id);
  }
}
