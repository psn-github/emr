import type { Pool } from "pg";
import type { WhoChecklistStore } from "./who-store.js";
import type { PhaseRecord, WhoChecklist } from "./who-checklist.js";

/** Postgres-backed WhoChecklistStore (one row per encounter; phases as jsonb). */
export class PgWhoChecklistStore implements WhoChecklistStore {
  constructor(private readonly pool: Pool) {}

  async save(c: WhoChecklist): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.who_checklist (encounter_id, sign_in, time_out, sign_out)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (encounter_id) DO UPDATE SET sign_in=EXCLUDED.sign_in, time_out=EXCLUDED.time_out, sign_out=EXCLUDED.sign_out`,
      [c.encounterId, c.sign_in ? JSON.stringify(c.sign_in) : null, c.time_out ? JSON.stringify(c.time_out) : null, c.sign_out ? JSON.stringify(c.sign_out) : null],
    );
  }
  async get(encounterId: string): Promise<WhoChecklist | undefined> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.who_checklist WHERE encounter_id = $1", [encounterId]);
    const row = r.rows[0];
    return row ? { encounterId: row.encounter_id, sign_in: row.sign_in, time_out: row.time_out, sign_out: row.sign_out } : undefined;
  }
}

interface Row { encounter_id: string; sign_in: PhaseRecord | null; time_out: PhaseRecord | null; sign_out: PhaseRecord | null }
