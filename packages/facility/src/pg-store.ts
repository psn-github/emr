import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Bed, BedId, Floor, LocationNode } from "./types.js";
import type { FacilityStore } from "./store.js";

/** Postgres-backed FacilityStore (config data; no PHI). */
export class PgFacilityStore implements FacilityStore {
  constructor(private readonly pool: Pool) {}

  async saveFloor(f: Floor): Promise<void> {
    await this.pool.query(
      `INSERT INTO facility.floor (id, level, name_ar, name_en) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET level=EXCLUDED.level, name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en`,
      [f.id, f.level, f.name.ar, f.name.en],
    );
  }

  async saveLocation(n: LocationNode): Promise<void> {
    await this.pool.query(
      `INSERT INTO facility.location_node (id, level, type, name_ar, name_en, capacity) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET level=EXCLUDED.level, type=EXCLUDED.type, name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, capacity=EXCLUDED.capacity`,
      [n.id, n.level, n.type, n.name.ar, n.name.en, n.capacity],
    );
  }

  async saveBed(b: Bed): Promise<void> {
    await this.pool.query(
      `INSERT INTO facility.bed (id, location_node_id, label, status) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET location_node_id=EXCLUDED.location_node_id, label=EXCLUDED.label, status=EXCLUDED.status`,
      [b.id, b.locationNodeId, b.label, b.status],
    );
  }

  async getBed(id: BedId): Promise<Bed | null> {
    const r = await this.pool.query<{ id: string; location_node_id: string; label: string; status: string }>(
      "SELECT id, location_node_id, label, status FROM facility.bed WHERE id = $1",
      [id],
    );
    const row = r.rows[0];
    return row
      ? { id: asId<"Bed">(row.id), locationNodeId: asId<"LocationNode">(row.location_node_id), label: row.label, status: row.status as Bed["status"] }
      : null;
  }

  async listBeds(): Promise<readonly Bed[]> {
    const r = await this.pool.query<{ id: string; location_node_id: string; label: string; status: string }>(
      "SELECT id, location_node_id, label, status FROM facility.bed ORDER BY label",
    );
    return r.rows.map((row) => ({
      id: asId<"Bed">(row.id),
      locationNodeId: asId<"LocationNode">(row.location_node_id),
      label: row.label,
      status: row.status as Bed["status"],
    }));
  }

  async listLocations(): Promise<readonly LocationNode[]> {
    const r = await this.pool.query<{ id: string; level: string; type: string; name_ar: string; name_en: string; capacity: number }>(
      "SELECT id, level, type, name_ar, name_en, capacity FROM facility.location_node ORDER BY level, type",
    );
    return r.rows.map((row) => ({
      id: asId<"LocationNode">(row.id),
      level: row.level as LocationNode["level"],
      type: row.type as LocationNode["type"],
      name: { ar: row.name_ar, en: row.name_en },
      capacity: row.capacity,
    }));
  }

  async listFloors(): Promise<readonly Floor[]> {
    const r = await this.pool.query<{ id: string; level: string; name_ar: string; name_en: string }>(
      "SELECT id, level, name_ar, name_en FROM facility.floor ORDER BY level",
    );
    return r.rows.map((row) => ({
      id: asId<"Floor">(row.id),
      level: row.level as Floor["level"],
      name: { ar: row.name_ar, en: row.name_en },
    }));
  }
}
