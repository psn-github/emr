import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Appointment, AppointmentId, AppointmentType, AppointmentTypeId, FloorLevel, Resource, ResourceId, ResourceKind } from "./types.js";
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
       ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, duration_min=EXCLUDED.duration_min, required_resource_kinds=EXCLUDED.required_resource_kinds, prep_ar=EXCLUDED.prep_ar, prep_en=EXCLUDED.prep_en, default_billing_item=EXCLUDED.default_billing_item`,
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

  async getResource(id: ResourceId): Promise<Resource | null> {
    const r = await this.pool.query<ResourceRow>("SELECT * FROM scheduling.resource WHERE id = $1", [id]);
    return r.rows[0] ? rowToResource(r.rows[0]) : null;
  }

  async getAppointmentType(id: AppointmentTypeId): Promise<AppointmentType | null> {
    const r = await this.pool.query<AppointmentTypeRow>("SELECT * FROM scheduling.appointment_type WHERE id = $1", [id]);
    return r.rows[0] ? rowToType(r.rows[0]) : null;
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

  async listResources(): Promise<readonly Resource[]> {
    const r = await this.pool.query<ResourceRow>("SELECT * FROM scheduling.resource ORDER BY kind, name_en");
    return r.rows.map(rowToResource);
  }

  async listAppointmentTypes(): Promise<readonly AppointmentType[]> {
    const r = await this.pool.query<AppointmentTypeRow>("SELECT * FROM scheduling.appointment_type ORDER BY name_en");
    return r.rows.map(rowToType);
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

interface ResourceRow {
  id: string;
  kind: string;
  name_ar: string;
  name_en: string;
  level: string | null;
  location_ref: string | null;
}
interface AppointmentTypeRow {
  id: string;
  name_ar: string;
  name_en: string;
  duration_min: number;
  required_resource_kinds: string[];
  prep_ar: string | null;
  prep_en: string | null;
  default_billing_item: string | null;
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: asId<"Resource">(row.id),
    kind: row.kind as ResourceKind,
    name: { ar: row.name_ar, en: row.name_en },
    ...(row.level !== null ? { level: row.level as FloorLevel } : {}),
    ...(row.location_ref !== null ? { locationRef: row.location_ref } : {}),
  };
}

function rowToType(row: AppointmentTypeRow): AppointmentType {
  const kinds = (typeof row.required_resource_kinds === "string" ? JSON.parse(row.required_resource_kinds) : row.required_resource_kinds) as ResourceKind[];
  return {
    id: asId<"AppointmentType">(row.id),
    name: { ar: row.name_ar, en: row.name_en },
    durationMin: Number(row.duration_min),
    requiredResourceKinds: kinds,
    ...(row.prep_ar !== null && row.prep_en !== null ? { prep: { ar: row.prep_ar, en: row.prep_en } } : {}),
    ...(row.default_billing_item !== null ? { defaultBillingItem: row.default_billing_item } : {}),
  };
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
