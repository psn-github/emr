import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertAdvance } from "./lifecycle.js";
import { assertConsentsComplete } from "./consent.js";
import type { FertilityGate } from "./gate.js";
import type { CycleStore } from "./store.js";
import { PERSON_SCOPED_TYPES, type Cycle, type CycleId, type CycleStatus, type CycleType } from "./types.js";

/**
 * Cycle engine. Treatment/embryo-creation cycles are couple-scoped and pass the
 * marriage hard-gate (via the injected FertilityGate); fertility-preservation is
 * person-scoped and needs no couple (ADR-0015). Progression out of `planned` is
 * blocked until required consents are signed. Every mutation is audited.
 */
export class CycleService {
  constructor(
    private readonly store: CycleStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    private readonly gate: FertilityGate,
  ) {}

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
      cancellationReason: null,
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

  async cancel(actorId: string, id: CycleId, reason: string): Promise<Result<Cycle, AppError>> {
    const cycle = await this.store.get(id);
    if (cycle === null) return err(notFound("cycle not found", "fertility.cycle.not_found"));
    const transition = assertAdvance(cycle.status, "cancelled");
    if (!transition.ok) return err(transition.error);
    const updated: Cycle = { ...cycle, status: "cancelled", cancellationReason: reason };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "Cycle", entityId: id, action: "UPDATE", before: { status: cycle.status }, after: { status: "cancelled", reason } });
    await this.events.emit({ type: "CycleCancelled", aggregateType: "Cycle", aggregateId: id, data: { reason } });
    return ok(updated);
  }

  get(id: CycleId): Promise<Cycle | null> {
    return this.store.get(id);
  }
}
