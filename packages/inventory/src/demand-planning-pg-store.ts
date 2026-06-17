import type { Pool } from "pg";
import type { CycleConsumptionItem, CycleConsumptionProfile, ConsumptionProfileStore } from "./demand-planning.js";

/** Postgres-backed cycle consumption profile config. */
export class PgConsumptionProfileStore implements ConsumptionProfileStore {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<readonly CycleConsumptionProfile[]> {
    const r = await this.pool.query<ProfileRow>("SELECT * FROM inventory.cycle_consumption_profile ORDER BY cycle_type");
    return r.rows.map((row) => ({ cycleType: row.cycle_type, items: row.items }));
  }
}

/** Idempotently seed cycle consumption profiles (config-as-data; safe to re-run). */
export async function seedConsumptionProfiles(pool: Pool, profiles: readonly CycleConsumptionProfile[]): Promise<void> {
  for (const p of profiles) {
    await pool.query(
      `INSERT INTO inventory.cycle_consumption_profile (cycle_type, items) VALUES ($1, $2)
       ON CONFLICT (cycle_type) DO UPDATE SET items = EXCLUDED.items`,
      [p.cycleType, JSON.stringify(p.items)],
    );
  }
}

interface ProfileRow {
  cycle_type: string;
  items: CycleConsumptionItem[];
}
