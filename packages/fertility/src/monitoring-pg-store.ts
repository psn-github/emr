import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { MonitoringVisit, Procedure } from "./monitoring.js";
import type { MonitoringStore } from "./monitoring-store.js";

/** Postgres-backed MonitoringStore. */
export class PgMonitoringStore implements MonitoringStore {
  constructor(private readonly pool: Pool) {}

  async saveVisit(v: MonitoringVisit): Promise<void> {
    await this.pool.query(
      `INSERT INTO fertility.monitoring_visit (id, cycle_id, visit_at, decision, note, next_visit_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [v.id, v.cycleId, v.visitAt, v.decision, v.note, v.nextVisitAt, v.recordedBy],
    );
  }
  async visitsForCycle(cycleId: string): Promise<readonly MonitoringVisit[]> {
    const r = await this.pool.query<VisitRow>("SELECT * FROM fertility.monitoring_visit WHERE cycle_id = $1 ORDER BY visit_at", [cycleId]);
    return r.rows.map(visitFrom);
  }
  async saveProcedure(p: Procedure): Promise<void> {
    await this.pool.query(
      `INSERT INTO fertility.procedure (id, cycle_id, type, scheduled_at, theatre_booking_ref)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET scheduled_at=EXCLUDED.scheduled_at, theatre_booking_ref=EXCLUDED.theatre_booking_ref`,
      [p.id, p.cycleId, p.type, p.scheduledAt, p.theatreBookingRef],
    );
  }
  async proceduresForCycle(cycleId: string): Promise<readonly Procedure[]> {
    const r = await this.pool.query<ProcRow>("SELECT * FROM fertility.procedure WHERE cycle_id = $1 ORDER BY scheduled_at", [cycleId]);
    return r.rows.map(procFrom);
  }
}

interface VisitRow { id: string; cycle_id: string; visit_at: Date; decision: string; note: string | null; next_visit_at: Date | null; recorded_by: string }
interface ProcRow { id: string; cycle_id: string; type: string; scheduled_at: Date; theatre_booking_ref: string | null }

function visitFrom(r: VisitRow): MonitoringVisit {
  return {
    id: asId<"MonitoringVisit">(r.id),
    cycleId: r.cycle_id,
    visitAt: new Date(r.visit_at).toISOString(),
    decision: r.decision as MonitoringVisit["decision"],
    note: r.note,
    nextVisitAt: r.next_visit_at ? new Date(r.next_visit_at).toISOString() : null,
    recordedBy: r.recorded_by,
  };
}
function procFrom(r: ProcRow): Procedure {
  return {
    id: asId<"Procedure">(r.id),
    cycleId: r.cycle_id,
    type: r.type as Procedure["type"],
    scheduledAt: new Date(r.scheduled_at).toISOString(),
    theatreBookingRef: r.theatre_booking_ref,
  };
}
