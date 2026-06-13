import type { Result, AppError } from "@oxford/core";
import { ok, err, newId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Observation, FollowUp } from "./types.js";
import type { RecoveryStore } from "./recovery-store.js";
import type { DischargeGate, PharmacyPort } from "./ports.js";
import { validateAldrete, assertDischargeReady } from "./recovery.js";

export interface RecordObservationInput {
  readonly encounterId: string;
  readonly phase: "recovery" | "post_op_ward";
  readonly aldreteScore?: number;
  readonly systolicBp: number;
  readonly heartRate: number;
  readonly spo2: number;
  readonly notes?: string;
  readonly recordedAt: string;
}
export interface BookFollowUpInput {
  readonly encounterId: string;
  readonly scheduledFor: string;
  readonly bookedAt: string;
}

/**
 * Recovery (L1) + post-op ward (L2) observations and the DISCHARGE GATE. Discharge
 * from L2 is blocked until the pharmacy has fulfilled the discharge prescription
 * (PharmacyPort) AND a follow-up is booked (ADR-0025). Implements DischargeGate,
 * which the perioperative journey consults on the discharge transition.
 */
export class RecoveryService implements DischargeGate {
  constructor(
    private readonly store: RecoveryStore,
    private readonly pharmacy: PharmacyPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async recordObservation(actorId: string, input: RecordObservationInput): Promise<Result<Observation, AppError>> {
    if (input.aldreteScore !== undefined) {
      const valid = validateAldrete(input.aldreteScore);
      if (!valid.ok) return err(valid.error);
    }
    const obs: Observation = {
      id: newId<"Observation">(),
      encounterId: input.encounterId,
      phase: input.phase,
      aldreteScore: input.aldreteScore ?? null,
      systolicBp: input.systolicBp,
      heartRate: input.heartRate,
      spo2: input.spo2,
      notes: input.notes ?? "",
      recordedAt: input.recordedAt,
      recordedBy: actorId,
    };
    await this.store.saveObservation(obs);
    await this.audit.record({ actorId, entityType: "Observation", entityId: obs.id, action: "CREATE", after: { encounterId: input.encounterId, phase: input.phase } });
    await this.events.emit({ type: "ObservationRecorded", aggregateType: "SurgicalEncounter", aggregateId: input.encounterId, data: { phase: input.phase } });
    return ok(obs);
  }

  async bookFollowUp(actorId: string, input: BookFollowUpInput): Promise<FollowUp> {
    const followUp: FollowUp = { id: newId<"FollowUp">(), encounterId: input.encounterId, scheduledFor: input.scheduledFor, bookedBy: actorId, bookedAt: input.bookedAt };
    await this.store.saveFollowUp(followUp);
    await this.audit.record({ actorId, entityType: "FollowUp", entityId: followUp.id, action: "CREATE", after: { encounterId: input.encounterId, scheduledFor: input.scheduledFor } });
    await this.events.emit({ type: "FollowUpBooked", aggregateType: "SurgicalEncounter", aggregateId: input.encounterId, data: { scheduledFor: input.scheduledFor } });
    return followUp;
  }

  /** The discharge gate: prescription fulfilled (pharmacy) + follow-up booked. */
  async assertMayDischarge(encounterId: string): Promise<Result<void, AppError>> {
    const fulfilled = await this.pharmacy.isPrescriptionFulfilled(encounterId);
    const followUpBooked = (await this.store.followUpForEncounter(encounterId)) !== undefined;
    return assertDischargeReady(fulfilled, followUpBooked);
  }

  observations(encounterId: string): Promise<readonly Observation[]> {
    return this.store.observationsForEncounter(encounterId);
  }
}
