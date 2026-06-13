import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { LocationMovement, PatientLocation } from "./flow-types.js";
import type { FlowStore } from "./flow-store.js";

/** Postgres-backed FlowStore (PHI: patient location + movement history). */
export class PgFlowStore implements FlowStore {
  constructor(private readonly pool: Pool) {}

  async saveLocation(loc: PatientLocation): Promise<void> {
    await this.pool.query(
      `INSERT INTO facility.patient_location (patient_id, location_node_id, bed_id, status, since_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (patient_id) DO UPDATE SET location_node_id=EXCLUDED.location_node_id, bed_id=EXCLUDED.bed_id, status=EXCLUDED.status, since_at=EXCLUDED.since_at`,
      [loc.patientId, loc.locationNodeId, loc.bedId, loc.status, loc.sinceAt],
    );
  }

  async getLocation(patientId: string): Promise<PatientLocation | null> {
    const r = await this.pool.query<LocationRow>(
      "SELECT patient_id, location_node_id, bed_id, status, since_at FROM facility.patient_location WHERE patient_id = $1",
      [patientId],
    );
    return r.rows[0] ? rowToLocation(r.rows[0]) : null;
  }

  async listCurrent(): Promise<readonly PatientLocation[]> {
    const r = await this.pool.query<LocationRow>(
      "SELECT patient_id, location_node_id, bed_id, status, since_at FROM facility.patient_location",
    );
    return r.rows.map(rowToLocation);
  }

  async saveMovement(m: LocationMovement): Promise<void> {
    await this.pool.query(
      `INSERT INTO facility.location_movement (id, patient_id, from_node_id, to_node_id, bed_id, status, moved_by, occurred_at, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [m.id, m.patientId, m.fromNodeId, m.toNodeId, m.bedId, m.status, m.movedBy, m.occurredAt, m.reason ?? null],
    );
  }

  async listMovements(patientId: string): Promise<readonly LocationMovement[]> {
    const r = await this.pool.query<MovementRow>(
      "SELECT * FROM facility.location_movement WHERE patient_id = $1 ORDER BY occurred_at",
      [patientId],
    );
    return r.rows.map(rowToMovement);
  }
}

interface LocationRow {
  patient_id: string;
  location_node_id: string;
  bed_id: string | null;
  status: string;
  since_at: Date;
}
interface MovementRow {
  id: string;
  patient_id: string;
  from_node_id: string | null;
  to_node_id: string;
  bed_id: string | null;
  status: string;
  moved_by: string;
  occurred_at: Date;
  reason: string | null;
}

function rowToLocation(r: LocationRow): PatientLocation {
  return {
    patientId: r.patient_id,
    locationNodeId: asId<"LocationNode">(r.location_node_id),
    bedId: r.bed_id ? asId<"Bed">(r.bed_id) : null,
    status: r.status as PatientLocation["status"],
    sinceAt: new Date(r.since_at).toISOString(),
  };
}
function rowToMovement(r: MovementRow): LocationMovement {
  return {
    id: asId<"LocationMovement">(r.id),
    patientId: r.patient_id,
    fromNodeId: r.from_node_id ? asId<"LocationNode">(r.from_node_id) : null,
    toNodeId: asId<"LocationNode">(r.to_node_id),
    bedId: r.bed_id ? asId<"Bed">(r.bed_id) : null,
    status: r.status as LocationMovement["status"],
    movedBy: r.moved_by,
    occurredAt: new Date(r.occurred_at).toISOString(),
    ...(r.reason ? { reason: r.reason } : {}),
  };
}
