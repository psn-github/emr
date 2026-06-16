import type { Pool } from "pg";
import type { OrderSet, OrderSetItem } from "./types.js";
import type { OrderSetStore } from "./order-sets.js";

/** Postgres-backed order-set config (items stored as JSON on the row). */
export class PgOrderSetStore implements OrderSetStore {
  constructor(private readonly pool: Pool) {}

  async get(id: string): Promise<OrderSet | null> {
    const r = await this.pool.query<OrderSetRow>("SELECT * FROM clinical.order_set WHERE id = $1", [id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async listActive(): Promise<readonly OrderSet[]> {
    const r = await this.pool.query<OrderSetRow>("SELECT * FROM clinical.order_set WHERE active = true ORDER BY id");
    return r.rows.map(fromRow);
  }
}

/** Idempotently seed order sets (config-as-data; safe to re-run). */
export async function seedOrderSets(pool: Pool, sets: readonly OrderSet[]): Promise<void> {
  for (const s of sets) {
    await pool.query(
      `INSERT INTO clinical.order_set (id, name_ar, name_en, items, active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, items=EXCLUDED.items, active=EXCLUDED.active`,
      [s.id, s.name.ar, s.name.en, JSON.stringify(s.items), s.active],
    );
  }
}

interface OrderSetRow { id: string; name_ar: string; name_en: string; items: OrderSetItem[]; active: boolean }

function fromRow(r: OrderSetRow): OrderSet {
  return { id: r.id, name: { ar: r.name_ar, en: r.name_en }, items: r.items, active: r.active };
}
