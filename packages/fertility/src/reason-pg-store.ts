import type { Pool } from "pg";
import type { CancellationCategory, CancellationReasonCode } from "./types.js";
import type { ReasonCodeStore } from "./reason-codes.js";

/** Postgres-backed cancellation reason code config. */
export class PgReasonCodeStore implements ReasonCodeStore {
  constructor(private readonly pool: Pool) {}

  async get(code: string): Promise<CancellationReasonCode | null> {
    const r = await this.pool.query<ReasonRow>("SELECT * FROM fertility.cancellation_reason WHERE code = $1", [code]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }

  async listActive(): Promise<readonly CancellationReasonCode[]> {
    const r = await this.pool.query<ReasonRow>("SELECT * FROM fertility.cancellation_reason WHERE active = true ORDER BY category, code");
    return r.rows.map(fromRow);
  }

  async save(reason: CancellationReasonCode): Promise<void> {
    await upsertReason(this.pool, reason);
  }
}

/** Idempotently seed the cancellation-reason config (config-as-data; safe to re-run). */
export async function seedCancellationReasons(pool: Pool, reasons: readonly CancellationReasonCode[]): Promise<void> {
  for (const r of reasons) await upsertReason(pool, r);
}

async function upsertReason(pool: Pool, r: CancellationReasonCode): Promise<void> {
  await pool.query(
    `INSERT INTO fertility.cancellation_reason (code, category, name_ar, name_en, active)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (code) DO UPDATE SET category=EXCLUDED.category, name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, active=EXCLUDED.active`,
    [r.code, r.category, r.name.ar, r.name.en, r.active],
  );
}

interface ReasonRow {
  code: string;
  category: string;
  name_ar: string;
  name_en: string;
  active: boolean;
}

function fromRow(r: ReasonRow): CancellationReasonCode {
  return { code: r.code, category: r.category as CancellationCategory, name: { ar: r.name_ar, en: r.name_en }, active: r.active };
}
