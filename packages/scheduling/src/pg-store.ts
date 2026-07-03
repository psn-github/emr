import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Appointment, AppointmentId, AppointmentType, Resource, ResourceId } from "./types.js";
import type { SchedulingStore } from "./store.js";

const ACTIVE = ["booked", "checked_in", "in_progress"];

/** Postgres-backed SchedulingStore. */
export class PgSchedulingStore implements SchedulingStore {
  constructor(private readonly pool: Pool) {}

  async saveResource(r: Resource): Promise<void> {
    await this.pool.query(
      `INSERT INTO scheduling.resource (id, kind, name_ar, name_en, level, location_ref) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind, name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, level=EXCLUDED.level, location_ref=EXCLUDED.location_ref`,
      [r.id, r.kind, r.name.ar, r.name.en, r.level ?? null, r.locationRef ?? null],
    );
  }

  async saveAppointmentType(t: AppointmentType): Promise<void> {
    await this.pool.query(
      `INSERT INTO scheduling.appointment_type (id, name_ar, name_en, duration_min, required_resource_kinds, prep_ar, prep_en, default_billing_item)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, duration_min=EXCLUDED.duration_min, required_resource_kinds=EXCLUDED.required_resource_kinds`,
      [t.id, t.name.ar, t.name.en, t.durationMin, JSON.stringify(t.requiredResourceKinds), t.prep?.ar ?? null, t.prep?.en ?? null, t.defaultBillingItem ?? null],
    );
  }

  async saveAppointment(a: Appointment): Promise<void> {
    await this.pool.query(
      `INSERT INTO scheduling.appointment (id, type_id, patient_id, practitioner_id, resource_ids, start_at, end_at, status, cancellation_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, cancellation_reason=EXCLUDED.cancellation_reason, start_at=EXCLUDED.start_at, end_at=EXCLUDED.end_at, resource_ids=EXCLUDED.resource_ids`,
      [a.id, a.typeId, a.patientId, a.practitionerId, JSON.stringify(a.resourceIds), a.start, a.end, a.status, a.cancellationReason ?? null],
    );
  }

  async getAppointment(id: AppointmentId): Promise<Appointment | null> {
    const r = await this.pool.query<AppointmentRow>("SELECT * FROM scheduling.appointment WHERE id = $1", [id]);
    return r.rows[0] ? rowToAppt(r.rows[0]) : null;
  }

  async activeForResources(resourceIds: readonly ResourceId[]): Promise<readonly Appointment[]> {
    if (resourceIds.length === 0) return [];
    const r = await this.pool.query<AppointmentRow>(
      `SELECT * FROM scheduling.appointment WHERE status = ANY($1) AND resource_ids ?| $2`,
      [ACTIVE, [...resourceIds]],
    );
    return r.rows.map(rowToAppt);
  }

  async appointmentsInRange(fromIso: string, toIso: string): Promise<readonly Appointment[]> {
    const r = await this.pool.query<AppointmentRow>(
      "SELECT * FROM scheduling.appointment WHERE start_at >= $1 AND start_at < $2 ORDER BY start_at",
      [fromIso, toIso],
    );
    return r.rows.map(rowToAppt);
  }

  async listAppointments(): Promise<readonly Appointment[]> {
    const r = await this.pool.query<AppointmentRow>("SELECT * FROM scheduling.appointment ORDER BY start_at");
    return r.rows.map(rowToAppt);
  }
}

interface AppointmentRow {
  id: string;
  type_id: string;
  patient_id: string;
  practitioner_id: string;
  resource_ids: string[];
  start_at: Date;
  end_at: Date;
  status: string;
  cancellation_reason: string | null;
}

function rowToAppt(row: AppointmentRow): Appointment {
  return {
    id: asId<"Appointment">(row.id),
    typeId: asId<"AppointmentType">(row.type_id),
    patientId: row.patient_id,
    practitionerId: asId<"Resource">(row.practitioner_id),
    resourceIds: row.resource_ids.map((r) => asId<"Resource">(r)),
    start: new Date(row.start_at).toISOString(),
    end: new Date(row.end_at).toISOString(),
    status: row.status as Appointment["status"],
    ...(row.cancellation_reason ? { cancellationReason: row.cancellation_reason } : {}),
  };
}
