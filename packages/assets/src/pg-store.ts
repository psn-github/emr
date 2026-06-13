import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Asset, AssetId, MaintenanceRecord, FaultRecord, FaultId } from "./types.js";
import type { AssetStore } from "./store.js";

/** Postgres-backed AssetStore. */
export class PgAssetStore implements AssetStore {
  constructor(private readonly pool: Pool) {}

  async saveAsset(a: Asset): Promise<void> {
    await this.pool.query(
      `INSERT INTO assets.asset (id, name, category, location_id, serial_number, supplier_id, warranty_expiry, critical, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, location_id=EXCLUDED.location_id, critical=EXCLUDED.critical, status=EXCLUDED.status`,
      [a.id, a.name, a.category, a.locationId, a.serialNumber, a.supplierId, a.warrantyExpiry, a.critical, a.status],
    );
  }
  async getAsset(id: AssetId): Promise<Asset | undefined> {
    const r = await this.pool.query<AssetRow>("SELECT * FROM assets.asset WHERE id = $1", [id]);
    return r.rows[0] ? assetFrom(r.rows[0]) : undefined;
  }
  async assets(): Promise<readonly Asset[]> {
    const r = await this.pool.query<AssetRow>("SELECT * FROM assets.asset ORDER BY name");
    return r.rows.map(assetFrom);
  }
  async saveMaintenance(m: MaintenanceRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO assets.maintenance_record (id, asset_id, type, performed_at, performed_by, next_due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.assetId, m.type, m.performedAt, m.performedBy, m.nextDueDate, m.notes],
    );
  }
  async maintenanceForAsset(assetId: string): Promise<readonly MaintenanceRecord[]> {
    const r = await this.pool.query<MaintRow>("SELECT * FROM assets.maintenance_record WHERE asset_id = $1 ORDER BY performed_at", [assetId]);
    return r.rows.map(maintFrom);
  }
  async saveFault(f: FaultRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO assets.fault_record (id, asset_id, reported_at, reported_by, description, severity, resolved_at, downtime_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET resolved_at=EXCLUDED.resolved_at, downtime_minutes=EXCLUDED.downtime_minutes`,
      [f.id, f.assetId, f.reportedAt, f.reportedBy, f.description, f.severity, f.resolvedAt, f.downtimeMinutes],
    );
  }
  async getFault(id: FaultId): Promise<FaultRecord | undefined> {
    const r = await this.pool.query<FaultRow>("SELECT * FROM assets.fault_record WHERE id = $1", [id]);
    return r.rows[0] ? faultFrom(r.rows[0]) : undefined;
  }
  async faultsForAsset(assetId: string): Promise<readonly FaultRecord[]> {
    const r = await this.pool.query<FaultRow>("SELECT * FROM assets.fault_record WHERE asset_id = $1 ORDER BY reported_at", [assetId]);
    return r.rows.map(faultFrom);
  }
}

interface AssetRow { id: string; name: string; category: string; location_id: string; serial_number: string; supplier_id: string | null; warranty_expiry: string | null; critical: boolean; status: string }
interface MaintRow { id: string; asset_id: string; type: string; performed_at: Date; performed_by: string; next_due_date: Date | null; notes: string }
interface FaultRow { id: string; asset_id: string; reported_at: Date; reported_by: string; description: string; severity: string; resolved_at: Date | null; downtime_minutes: number | null }

const iso = (d: Date | null): string | null => (d === null ? null : new Date(d).toISOString());

function assetFrom(r: AssetRow): Asset {
  return { id: asId<"Asset">(r.id), name: r.name, category: r.category as Asset["category"], locationId: r.location_id, serialNumber: r.serial_number, supplierId: r.supplier_id, warrantyExpiry: r.warranty_expiry, critical: r.critical, status: r.status as Asset["status"] };
}
function maintFrom(r: MaintRow): MaintenanceRecord {
  return { id: asId<"Maintenance">(r.id), assetId: r.asset_id, type: r.type as MaintenanceRecord["type"], performedAt: new Date(r.performed_at).toISOString(), performedBy: r.performed_by, nextDueDate: iso(r.next_due_date), notes: r.notes };
}
function faultFrom(r: FaultRow): FaultRecord {
  return { id: asId<"Fault">(r.id), assetId: r.asset_id, reportedAt: new Date(r.reported_at).toISOString(), reportedBy: r.reported_by, description: r.description, severity: r.severity as FaultRecord["severity"], resolvedAt: iso(r.resolved_at), downtimeMinutes: r.downtime_minutes };
}
