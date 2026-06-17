import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { ConsumableUse, DeviceCatalogueEntry } from "./types.js";
import type { DeviceCatalogueStore } from "./device-registry.js";
import type { ImplantUsageStore } from "./device-registry-store.js";

/** Postgres-backed device catalogue config. */
export class PgDeviceCatalogueStore implements DeviceCatalogueStore {
  constructor(private readonly pool: Pool) {}

  async get(code: string): Promise<DeviceCatalogueEntry | null> {
    const r = await this.pool.query<CatRow>("SELECT * FROM perioperative.device_catalogue WHERE code = $1", [code]);
    return r.rows[0] ? catFrom(r.rows[0]) : null;
  }
  async listActive(): Promise<readonly DeviceCatalogueEntry[]> {
    const r = await this.pool.query<CatRow>("SELECT * FROM perioperative.device_catalogue WHERE active = true ORDER BY code");
    return r.rows.map(catFrom);
  }
}

/** Postgres-backed query over consumable_use lines for registry reporting. */
export class PgImplantUsageStore implements ImplantUsageStore {
  constructor(private readonly pool: Pool) {}

  async byPatient(patientId: string): Promise<readonly ConsumableUse[]> {
    const r = await this.pool.query<ConsRow>("SELECT * FROM perioperative.consumable_use WHERE patient_id = $1 ORDER BY recorded_at", [patientId]);
    return r.rows.map(consFrom);
  }
  async byCodeLot(code: string, lotNo?: string): Promise<readonly ConsumableUse[]> {
    const r = await this.pool.query<ConsRow>(
      "SELECT * FROM perioperative.consumable_use WHERE code = $1 AND ($2::text IS NULL OR lot_no = $2) ORDER BY recorded_at",
      [code, lotNo ?? null],
    );
    return r.rows.map(consFrom);
  }
  async inWindow(since: string, until: string): Promise<readonly ConsumableUse[]> {
    const r = await this.pool.query<ConsRow>("SELECT * FROM perioperative.consumable_use WHERE recorded_at >= $1 AND recorded_at <= $2 ORDER BY recorded_at", [since, until]);
    return r.rows.map(consFrom);
  }
}

/** Idempotently seed the device catalogue (config-as-data; safe to re-run). */
export async function seedDeviceCatalogue(pool: Pool, entries: readonly DeviceCatalogueEntry[]): Promise<void> {
  for (const e of entries) {
    await pool.query(
      `INSERT INTO perioperative.device_catalogue (code, name_ar, name_en, device_type, manufacturer, active)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en,
         device_type=EXCLUDED.device_type, manufacturer=EXCLUDED.manufacturer, active=EXCLUDED.active`,
      [e.code, e.name.ar, e.name.en, e.deviceType, e.manufacturer, e.active],
    );
  }
}

interface CatRow { code: string; name_ar: string; name_en: string; device_type: string; manufacturer: string; active: boolean }
interface ConsRow { id: string; encounter_id: string; patient_id: string; code: string; description: string; lot_no: string; quantity: number; unit_price_fils: number; invoice_ref: string; recorded_by: string; recorded_at: Date }

function catFrom(r: CatRow): DeviceCatalogueEntry {
  return { code: r.code, name: { ar: r.name_ar, en: r.name_en }, deviceType: r.device_type, manufacturer: r.manufacturer, active: r.active };
}
function consFrom(r: ConsRow): ConsumableUse {
  return { id: asId<"ConsumableUse">(r.id), encounterId: r.encounter_id, patientId: r.patient_id, code: r.code, description: r.description, lotNo: r.lot_no, quantity: r.quantity, unitPriceFils: r.unit_price_fils, invoiceRef: r.invoice_ref, recordedBy: r.recorded_by, recordedAt: new Date(r.recorded_at).toISOString() };
}
