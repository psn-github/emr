import type { Result, AppError, Clock } from "@oxford/core";
import { newId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { OxfordHandlingEvent, WitnessReconciliation } from "./types.js";
import type { WitnessingStore } from "./store.js";
import type { WitnessingProvider } from "./provider.js";
import { reconcileCycle, assertSignOffAllowed } from "./reconcile.js";

export interface RegisterHandlingInput {
  readonly cycleId: string;
  readonly stepKey: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly occurredAt: string;
}

/**
 * Witnessing reconciliation service. Oxford never witnesses — RI Witness is
 * authoritative. This service records the handling events Oxford observed,
 * pushes demographics out (Oxford is master), ingests RI records back,
 * maintains the reconciliation ledger, and BLOCKS cycle-step sign-off whenever
 * any event is not `matched`. No method can override RI Witness.
 */
export class WitnessingService {
  constructor(
    private readonly store: WitnessingStore,
    private readonly provider: WitnessingProvider,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  /** Record a handling event Oxford observed and push demographics to RI. The
   *  event starts `pending_sync` — it only becomes `matched` once RI confirms. */
  async registerHandlingEvent(actorId: string, input: RegisterHandlingInput): Promise<OxfordHandlingEvent> {
    const event: OxfordHandlingEvent = {
      id: newId<"HandlingEvent">(),
      cycleId: input.cycleId,
      stepKey: input.stepKey,
      oxfordKey: input.oxfordKey,
      patientId: input.patientId,
      sampleId: input.sampleId,
      occurredAt: input.occurredAt,
      recordedBy: actorId,
    };
    await this.store.saveEvent(event);
    await this.provider.pushDemographics({ patientId: input.patientId, cycleId: input.cycleId });

    const now = this.clock.now().toISOString();
    const initial: WitnessReconciliation = {
      id: newId<"WitnessReconciliation">(),
      cycleId: event.cycleId,
      handlingEventId: event.id,
      oxfordKey: event.oxfordKey,
      riRecordId: null,
      status: "pending_sync",
      reason: "no_ri_record",
      reconciledAt: now,
    };
    await this.store.saveReconciliation(initial);
    await this.audit.record({
      actorId,
      entityType: "HandlingEvent",
      entityId: event.id,
      action: "CREATE",
      after: { cycleId: event.cycleId, stepKey: event.stepKey, status: "pending_sync" },
    });
    await this.events.emit({
      type: "HandlingEventRecorded",
      aggregateType: "Cycle",
      aggregateId: event.cycleId,
      data: { stepKey: event.stepKey, oxfordKey: event.oxfordKey },
    });
    return event;
  }

  /** Pull RI records and re-reconcile the whole cycle, appending ledger rows. */
  async ingest(actorId: string, cycleId: string): Promise<readonly WitnessReconciliation[]> {
    const [events, riRecords] = await Promise.all([
      this.store.eventsForCycle(cycleId),
      this.provider.fetchRecordsForCycle(cycleId),
    ]);
    const now = this.clock.now().toISOString();
    const rows = reconcileCycle(events, riRecords, now);
    for (const row of rows) await this.store.saveReconciliation(row);

    const divergent = rows.filter((r) => r.status === "divergent").length;
    const pending = rows.filter((r) => r.status === "pending_sync").length;
    await this.audit.record({
      actorId,
      entityType: "WitnessReconciliation",
      entityId: cycleId,
      action: "UPDATE",
      after: { matched: rows.length - divergent - pending, divergent, pending },
    });
    await this.events.emit({
      type: "WitnessReconciled",
      aggregateType: "Cycle",
      aggregateId: cycleId,
      data: { total: rows.length, divergent, pending },
    });
    return rows;
  }

  /** Current reconciliation of the cycle, computed fresh against live RI state. */
  async reconcileNow(cycleId: string): Promise<readonly WitnessReconciliation[]> {
    const [events, riRecords] = await Promise.all([
      this.store.eventsForCycle(cycleId),
      this.provider.fetchRecordsForCycle(cycleId),
    ]);
    return reconcileCycle(events, riRecords, this.clock.now().toISOString());
  }

  /**
   * The blocking gate. Sign-off of a cycle step is allowed ONLY if every
   * handling event reconciles `matched` against the live RI Witness state and
   * there are no orphan RI records. There is no override.
   */
  async assertCycleStepSignOff(cycleId: string): Promise<Result<void, AppError>> {
    const rows = await this.reconcileNow(cycleId);
    return assertSignOffAllowed(rows);
  }
}
