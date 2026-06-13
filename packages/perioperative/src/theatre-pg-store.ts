import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { TheatreCase, TheatreCaseId } from "./types.js";
import type { TheatreCaseStore } from "./theatre-store.js";

/** Postgres-backed TheatreCaseStore. */
export class PgTheatreCaseStore implements TheatreCaseStore {
  constructor(private readonly pool: Pool) {}

  async save(c: TheatreCase): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.theatre_case
         (id, patient_id, encounter_id, procedure, theatre_resource_id, surgeon_resource_id, support_resource_ids, equipment, scheduled_date, start, end_at, status, appointment_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [c.id, c.patientId, c.encounterId, c.procedure, c.theatreResourceId, c.surgeonResourceId, JSON.stringify(c.supportResourceIds), JSON.stringify(c.equipment), c.scheduledDate, c.start, c.end, c.status, c.appointmentRef],
    );
  }
  async get(id: TheatreCaseId): Promise<TheatreCase | undefined> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.theatre_case WHERE id = $1", [id]);
    return r.rows[0] ? from(r.rows[0]) : undefined;
  }
  async scheduledForDate(scheduledDate: string): Promise<readonly TheatreCase[]> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.theatre_case WHERE scheduled_date = $1 AND status = 'scheduled' ORDER BY start", [scheduledDate]);
    return r.rows.map(from);
  }
}

interface Row {
  id: string; patient_id: string; encounter_id: string | null; procedure: string; theatre_resource_id: string;
  surgeon_resource_id: string; support_resource_ids: string[]; equipment: string[]; scheduled_date: string;
  start: Date; end_at: Date; status: string; appointment_ref: string;
}

function from(r: Row): TheatreCase {
  return {
    id: asId<"TheatreCase">(r.id),
    patientId: r.patient_id,
    encounterId: r.encounter_id,
    procedure: r.procedure,
    theatreResourceId: r.theatre_resource_id,
    surgeonResourceId: r.surgeon_resource_id,
    supportResourceIds: r.support_resource_ids,
    equipment: r.equipment,
    scheduledDate: typeof r.scheduled_date === "string" ? r.scheduled_date : new Date(r.scheduled_date).toISOString().slice(0, 10),
    start: new Date(r.start).toISOString(),
    end: new Date(r.end_at).toISOString(),
    status: r.status as TheatreCase["status"],
    appointmentRef: r.appointment_ref,
  };
}
