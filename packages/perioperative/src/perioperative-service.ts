import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { SurgicalEncounter, SurgicalEncounterId, JourneyStage } from "./types.js";
import type { PerioperativeStore } from "./store.js";
import type { FacilityFlowPort, ChecklistGate } from "./ports.js";
import { assertAdvance, stagePlacement } from "./journey.js";

export interface AdmitInput {
  readonly patientId: string;
  readonly indication: string;
  readonly admittedAt: string;
  readonly theatreCaseRef?: string;
}

/**
 * Perioperative journey service. Owns the SurgicalEncounter and drives every
 * stage transition as an audited bed/floor movement through the facility/flow
 * seam (ADR-0023). Capacity is enforced by the seam — a stage that needs a bed/
 * theatre fails if none is free. The lab/theatre clinical records, WHO checklist,
 * consumables and the discharge pharmacy gate land in later Phase 3 PRs.
 */
export class PerioperativeService {
  constructor(
    private readonly store: PerioperativeStore,
    private readonly flow: FacilityFlowPort,
    private readonly checklist: ChecklistGate,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  /** Admit a surgical patient on L3 and open the encounter. */
  async admit(actorId: string, input: AdmitInput): Promise<Result<SurgicalEncounter, AppError>> {
    const placement = stagePlacement("admitted")!;
    const placed = await this.flow.place(actorId, input.patientId, placement.kind, placement.status);
    if (!placed.ok) return err(placed.error);
    const encounter: SurgicalEncounter = {
      id: newId<"SurgicalEncounter">(),
      patientId: input.patientId,
      indication: input.indication,
      stage: "admitted",
      theatreCaseRef: input.theatreCaseRef ?? null,
      admittedAt: input.admittedAt,
      cancellationReason: null,
    };
    await this.store.save(encounter);
    await this.audit.record({ actorId, entityType: "SurgicalEncounter", entityId: encounter.id, action: "CREATE", after: { patientId: input.patientId, stage: "admitted" } });
    await this.events.emit({ type: "SurgicalEncounterAdmitted", aggregateType: "SurgicalEncounter", aggregateId: encounter.id, data: { indication: input.indication } });
    return ok(encounter);
  }

  /** Advance the journey one stage. Drives the bed/floor movement (capacity-aware)
   *  via the seam, then records the new stage. Cancellation uses `cancel`. */
  async advanceJourney(actorId: string, encounterId: SurgicalEncounterId, toStage: JourneyStage): Promise<Result<SurgicalEncounter, AppError>> {
    const encounter = await this.store.get(encounterId);
    if (encounter === undefined) return err(notFound("surgical encounter not found", "perioperative.encounter.not_found"));
    if (toStage === "cancelled") return err(validationError("use cancel() to cancel an encounter", "perioperative.use_cancel"));
    const transition = assertAdvance(encounter.stage, toStage);
    if (!transition.ok) return err(transition.error);

    // WHO checklist BLOCKING gate (docs/01 §E7): no incision without sign-in +
    // time-out; no leaving theatre without sign-out.
    if (toStage === "in_theatre") {
      const gate = await this.checklist.assertMayEnterTheatre(encounterId);
      if (!gate.ok) return err(gate.error);
    }
    if (encounter.stage === "in_theatre" && toStage === "recovery") {
      const gate = await this.checklist.assertMayLeaveTheatre(encounterId);
      if (!gate.ok) return err(gate.error);
    }

    const placement = stagePlacement(toStage);
    if (placement !== null) {
      const placed = await this.flow.place(actorId, encounter.patientId, placement.kind, placement.status);
      if (!placed.ok) return err(placed.error); // capacity / blocked
    } else {
      const released = await this.flow.release(actorId, encounter.patientId, "discharged");
      if (!released.ok) return err(released.error);
    }
    const updated: SurgicalEncounter = { ...encounter, stage: toStage };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "SurgicalEncounter", entityId: encounterId, action: "UPDATE", before: { stage: encounter.stage }, after: { stage: toStage } });
    await this.events.emit({ type: "SurgicalJourneyAdvanced", aggregateType: "SurgicalEncounter", aggregateId: encounterId, data: { stage: toStage } });
    return ok(updated);
  }

  /** Cancel an encounter (frees the bed). Allowed from any non-terminal stage. */
  async cancel(actorId: string, encounterId: SurgicalEncounterId, reason: string): Promise<Result<SurgicalEncounter, AppError>> {
    const encounter = await this.store.get(encounterId);
    if (encounter === undefined) return err(notFound("surgical encounter not found", "perioperative.encounter.not_found"));
    const transition = assertAdvance(encounter.stage, "cancelled");
    if (!transition.ok) return err(transition.error);
    const released = await this.flow.release(actorId, encounter.patientId, `cancelled: ${reason}`);
    if (!released.ok) return err(released.error);
    const updated: SurgicalEncounter = { ...encounter, stage: "cancelled", cancellationReason: reason };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "SurgicalEncounter", entityId: encounterId, action: "UPDATE", before: { stage: encounter.stage }, after: { stage: "cancelled", reason } });
    await this.events.emit({ type: "SurgicalEncounterCancelled", aggregateType: "SurgicalEncounter", aggregateId: encounterId, data: { reason } });
    return ok(updated);
  }

  get(id: SurgicalEncounterId): Promise<SurgicalEncounter | undefined> {
    return this.store.get(id);
  }
  active(): Promise<readonly SurgicalEncounter[]> {
    return this.store.active();
  }
}
