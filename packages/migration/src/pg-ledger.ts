import type { Pool } from "pg";
import type { ImportLedger } from "./ledger.js";

/** Postgres-backed import ledger (re-runnable migration state). */
export class PgImportLedger implements ImportLedger {
  constructor(private readonly pool: Pool) {}

  async targetFor(system: string, entity: string, sourceId: string): Promise<string | null> {
    const r = await this.pool.query<{ target_id: string }>(
      "SELECT target_id FROM migration.import_ledger WHERE source_system = $1 AND entity = $2 AND source_id = $3",
      [system, entity, sourceId],
    );
    return r.rows[0]?.target_id ?? null;
  }

  async record(system: string, entity: string, sourceId: string, targetId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO migration.import_ledger (source_system, entity, source_id, target_id, imported_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (source_system, entity, source_id) DO NOTHING`,
      [system, entity, sourceId, targetId],
    );
  }

  async importedSourceIds(system: string, entity: string): Promise<Set<string>> {
    const r = await this.pool.query<{ source_id: string }>(
      "SELECT source_id FROM migration.import_ledger WHERE source_system = $1 AND entity = $2",
      [system, entity],
    );
    return new Set(r.rows.map((row) => row.source_id));
  }
}
