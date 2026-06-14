import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { LabQcParameter, LabQcReading, LabQcStatus } from "./types.js";
import type { QcParameterStore } from "./qc.js";
import type { QcReadingFilter, QcReadingStore } from "./qc-store.js";

/** Postgres-backed QC parameter config. */
export class PgQcParameterStore implements QcParameterStore {
  constructor(private readonly pool: Pool) {}

  async get(code: string): Promise<LabQcParameter | null> {
    const r = await this.pool.query<ParamRow>("SELECT * FROM embryology.qc_parameter WHERE code = $1", [code]);
    return r.rows[0] ? paramFromRow(r.rows[0]) : null;
  }
  async listActive(): Promise<readonly LabQcParameter[]> {
    const r = await this.pool.query<ParamRow>("SELECT * FROM embryology.qc_parameter WHERE active = true ORDER BY code");
    return r.rows.map(paramFromRow);
  }
}

/** Postgres-backed QC reading log. */
export class PgQcReadingStore implements QcReadingStore {
  constructor(private readonly pool: Pool) {}

  async save(r: LabQcReading): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.qc_reading (id, parameter_code, value, unit, asset_ref, lot_no, status, recorded_by, recorded_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [r.id, r.parameterCode, r.value, r.unit, r.assetRef, r.lotNo, r.status, r.recordedBy, r.recordedAt, r.note],
    );
  }
  async list(filter: QcReadingFilter): Promise<readonly LabQcReading[]> {
    const rows = await this.pool.query<ReadingRow>(
      `SELECT * FROM embryology.qc_reading
       WHERE ($1::text IS NULL OR parameter_code = $1)
         AND ($2::text IS NULL OR asset_ref = $2)
         AND ($3::text IS NULL OR lot_no = $3)
         AND ($4::timestamptz IS NULL OR recorded_at >= $4)
       ORDER BY recorded_at DESC`,
      [filter.parameterCode ?? null, filter.assetRef ?? null, filter.lotNo ?? null, filter.since ?? null],
    );
    return rows.rows.map(readingFromRow);
  }
}

/** Idempotently seed QC parameters (config-as-data; safe to re-run). */
export async function seedQcParameters(pool: Pool, params: readonly LabQcParameter[]): Promise<void> {
  for (const p of params) {
    await pool.query(
      `INSERT INTO embryology.qc_parameter (code, name_ar, name_en, unit, min_value, max_value, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, unit=EXCLUDED.unit,
         min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value, active=EXCLUDED.active`,
      [p.code, p.name.ar, p.name.en, p.unit, p.min, p.max, p.active],
    );
  }
}

interface ParamRow { code: string; name_ar: string; name_en: string; unit: string; min_value: string; max_value: string; active: boolean }
interface ReadingRow { id: string; parameter_code: string; value: string; unit: string; asset_ref: string | null; lot_no: string | null; status: string; recorded_by: string; recorded_at: Date; note: string | null }

function paramFromRow(r: ParamRow): LabQcParameter {
  return { code: r.code, name: { ar: r.name_ar, en: r.name_en }, unit: r.unit, min: Number(r.min_value), max: Number(r.max_value), active: r.active };
}
function readingFromRow(r: ReadingRow): LabQcReading {
  return {
    id: asId<"LabQcReading">(r.id),
    parameterCode: r.parameter_code,
    value: Number(r.value),
    unit: r.unit,
    assetRef: r.asset_ref,
    lotNo: r.lot_no,
    status: r.status as LabQcStatus,
    recordedBy: r.recorded_by,
    recordedAt: new Date(r.recorded_at).toISOString(),
    note: r.note,
  };
}
