import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { computeRetrievalTime } from "./trigger.js";
import type { MonitoringDecision, MonitoringVisit, Procedure, ProcedureId, ProcedureType } from "./monitoring.js";
import type { MonitoringStore } from "./monitoring-store.js";

export interface RecordVisitInput {
  readonly visitAt: string;
  readonly decision: MonitoringDecision;
  readonly note?: string;
  readonly nextVisitAt?: string;
  /** Required when decision === "trigger": the trigger injection time. */
  readonly triggerAt?: string;
  /** Optional override of the trigger→retrieval interval (hours). */
  readonly leadHours?: number;
}

export interface VisitResult {
  readonly visit: MonitoringVisit;
  /** Auto-created retrieval procedure when the decision is `trigger`. */
  readonly retrieval: Procedure | null;
}

/**
 * Monitoring-visit workflow. Records the clinician decision (audited + event);
 * a `trigger` decision computes the retrieval time and creates a retrieval
 * Procedure (the theatre slot is booked in the app layer via scheduling).
 */
export class MonitoringService {
  constructor(
    private readonly store: MonitoringStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async recordVisit(actorId: string, cycleId: string, input: RecordVisitInput): Promise<Result<VisitResult, AppError>> {
    let retrieval: Procedure | null = null;
    if (input.decision === "trigger") {
      if (input.triggerAt === undefined) {
        return err(validationError("trigger decision requires a trigger time", "fertility.trigger.missing_time"));
      }
      const retrievalAt = computeRetrievalTime(input.triggerAt, input.leadHours);
      if (!retrievalAt.ok) return err(retrievalAt.error);
      retrieval = { id: newId<"Procedure">(), cycleId, type: "retrieval", scheduledAt: retrievalAt.value, theatreBookingRef: null };
      await this.store.saveProcedure(retrieval);
    }

    const visit: MonitoringVisit = {
      id: newId<"MonitoringVisit">(),
      cycleId,
      visitAt: input.visitAt,
      decision: input.decision,
      note: input.note ?? null,
      nextVisitAt: input.nextVisitAt ?? null,
      recordedBy: actorId,
    };
    await this.store.saveVisit(visit);
    await this.audit.record({ actorId, entityType: "MonitoringVisit", entityId: visit.id, action: "CREATE", after: { cycleId, decision: input.decision } });
    await this.events.emit({ type: "MonitoringDecisionRecorded", aggregateType: "Cycle", aggregateId: cycleId, data: { decision: input.decision, retrievalAt: retrieval?.scheduledAt ?? null } });
    return ok({ visit, retrieval });
  }

  /** Record/schedule a procedure (e.g. transfer); link a theatre booking ref. */
  async scheduleProcedure(actorId: string, cycleId: string, type: ProcedureType, scheduledAt: string, theatreBookingRef?: string): Promise<Procedure> {
    const procedure: Procedure = { id: newId<"Procedure">(), cycleId, type, scheduledAt, theatreBookingRef: theatreBookingRef ?? null };
    await this.store.saveProcedure(procedure);
    await this.audit.record({ actorId, entityType: "Procedure", entityId: procedure.id, action: "CREATE", after: { type, scheduledAt } });
    await this.events.emit({ type: "ProcedureScheduled", aggregateType: "Cycle", aggregateId: cycleId, data: { type, scheduledAt } });
    return procedure;
  }

  /** Attach a theatre booking ref once the app layer books the slot. */
  async linkTheatreBooking(actorId: string, procedure: Procedure, theatreBookingRef: string): Promise<Procedure> {
    const updated: Procedure = { ...procedure, theatreBookingRef };
    await this.store.saveProcedure(updated);
    await this.audit.record({ actorId, entityType: "Procedure", entityId: procedure.id, action: "UPDATE", before: { ref: procedure.theatreBookingRef }, after: { ref: theatreBookingRef } });
    return updated;
  }

  visits(cycleId: string): Promise<readonly MonitoringVisit[]> {
    return this.store.visitsForCycle(cycleId);
  }
  procedures(cycleId: string): Promise<readonly Procedure[]> {
    return this.store.proceduresForCycle(cycleId);
  }

  procedure(id: ProcedureId, cycleId: string): Promise<Procedure | undefined> {
    return this.store.proceduresForCycle(cycleId).then((ps) => ps.find((p) => p.id === id));
  }
}
