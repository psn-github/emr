import type { Pool } from "pg";
import type { AdvancedTestSpec, AdvancedTestDirection } from "./types.js";
import type { AdvancedTestSpecStore } from "./advanced-tests.js";

/** Postgres-backed advanced sperm test spec config. */
export class PgAdvancedTestSpecStore implements AdvancedTestSpecStore {
  constructor(private readonly pool: Pool) {}

  async get(code: string): Promise<AdvancedTestSpec | null> {
    const r = await this.pool.query<SpecRow>("SELECT * FROM andrology.advanced_test_spec WHERE code = $1", [code]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async listActive(): Promise<readonly AdvancedTestSpec[]> {
    const r = await this.pool.query<SpecRow>("SELECT * FROM andrology.advanced_test_spec WHERE active = true ORDER BY code");
    return r.rows.map(fromRow);
  }
}

/** Idempotently seed advanced test specs (config-as-data; safe to re-run). */
export async function seedAdvancedTestSpecs(pool: Pool, specs: readonly AdvancedTestSpec[]): Promise<void> {
  for (const s of specs) {
    await pool.query(
      `INSERT INTO andrology.advanced_test_spec (code, name_ar, name_en, unit, direction, normal_threshold, borderline_threshold, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, unit=EXCLUDED.unit,
         direction=EXCLUDED.direction, normal_threshold=EXCLUDED.normal_threshold, borderline_threshold=EXCLUDED.borderline_threshold, active=EXCLUDED.active`,
      [s.code, s.name.ar, s.name.en, s.unit, s.direction, s.normalThreshold, s.borderlineThreshold, s.active],
    );
  }
}

interface SpecRow { code: string; name_ar: string; name_en: string; unit: string; direction: string; normal_threshold: string; borderline_threshold: string; active: boolean }

function fromRow(r: SpecRow): AdvancedTestSpec {
  return {
    code: r.code,
    name: { ar: r.name_ar, en: r.name_en },
    unit: r.unit,
    direction: r.direction as AdvancedTestDirection,
    normalThreshold: Number(r.normal_threshold),
    borderlineThreshold: Number(r.borderline_threshold),
    active: r.active,
  };
}
