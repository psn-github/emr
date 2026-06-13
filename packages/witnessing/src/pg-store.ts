import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { OxfordHandlingEvent, WitnessReconciliation } from "./types.js";
import type { WitnessingStore } from "./store.js";

/** Postgres-backed WitnessingStore. The reconciliation table is append-only
 *  (no UPDATE/DELETE) — each ingest writes fresh rows. */
export class PgWitnessingStore implements WitnessingStore {
  constructor(private readonly pool: Pool) {}

  async saveEvent(e: OxfordHandlingEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO witnessing.handling_event
         (id, cycle_id, step_key, oxford_key, patient_id, sample_id, occurred_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.cycleId, e.stepKey, e.oxfordKey, e.patientId, e.sampleId, e.occurredAt, e.recordedBy],
    );
  }
  async eventsForCycle(cycleId: string): Promise<readonly OxfordHandlingEvent[]> {
    const r = await this.pool.query<EventRow>(
      "SELECT * FROM witnessing.handling_event WHERE cycle_id = $1 ORDER BY occurred_at",
      [cycleId],
    );
    return r.rows.map(eventFrom);
  }
  async saveReconciliation(row: WitnessReconciliation): Promise<void> {
    await this.pool.query(
      `INSERT INTO witnessing.reconciliation
         (id, cycle_id, handling_event_id, oxford_key, ri_record_id, status, reason, reconciled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [row.id, row.cycleId, row.handlingEventId, row.oxfordKey, row.riRecordId, row.status, row.reason, row.reconciledAt],
    );
  }
  async reconciliationsForCycle(cycleId: string): Promise<readonly WitnessReconciliation[]> {
    const r = await this.pool.query<ReconRow>(
      "SELECT * FROM witnessing.reconciliation WHERE cycle_id = $1 ORDER BY reconciled_at",
      [cycleId],
    );
    return r.rows.map(reconFrom);
  }
}

interface EventRow {
  id: string;
  cycle_id: string;
  step_key: string;
  oxford_key: string;
  patient_id: string;
  sample_id: string;
  occurred_at: Date;
  recorded_by: string;
}
interface ReconRow {
  id: string;
  cycle_id: string;
  handling_event_id: string | null;
  oxford_key: string;
  ri_record_id: string | null;
  status: string;
  reason: string | null;
  reconciled_at: Date;
}

function eventFrom(r: EventRow): OxfordHandlingEvent {
  return {
    id: asId<"HandlingEvent">(r.id),
    cycleId: r.cycle_id,
    stepKey: r.step_key,
    oxfordKey: r.oxford_key,
    patientId: r.patient_id,
    sampleId: r.sample_id,
    occurredAt: new Date(r.occurred_at).toISOString(),
    recordedBy: r.recorded_by,
  };
}
function reconFrom(r: ReconRow): WitnessReconciliation {
  return {
    id: asId<"WitnessReconciliation">(r.id),
    cycleId: r.cycle_id,
    handlingEventId: r.handling_event_id ? asId<"HandlingEvent">(r.handling_event_id) : null,
    oxfordKey: r.oxford_key,
    riRecordId: r.ri_record_id,
    status: r.status as WitnessReconciliation["status"],
    reason: r.reason as WitnessReconciliation["reason"],
    reconciledAt: new Date(r.reconciled_at).toISOString(),
  };
}
