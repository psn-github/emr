import type { Pool } from "pg";
import type { CycleTemplate } from "./cycle-template.js";
import type { CycleTemplateStore } from "./cycle-template.js";
import type { CycleType } from "./types.js";

/** Postgres-backed cycle template config. */
export class PgCycleTemplateStore implements CycleTemplateStore {
  constructor(private readonly pool: Pool) {}

  async get(id: string): Promise<CycleTemplate | null> {
    const r = await this.pool.query<TemplateRow>("SELECT * FROM fertility.cycle_template WHERE id = $1", [id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }

  async listFor(staffId: string): Promise<readonly CycleTemplate[]> {
    const r = await this.pool.query<TemplateRow>(
      "SELECT * FROM fertility.cycle_template WHERE active = true AND (owner_staff_id IS NULL OR owner_staff_id = $1) ORDER BY id",
      [staffId],
    );
    return r.rows.map(fromRow);
  }
}

/** Idempotently seed cycle templates (config-as-data; safe to re-run). */
export async function seedCycleTemplates(pool: Pool, templates: readonly CycleTemplate[]): Promise<void> {
  for (const t of templates) {
    await pool.query(
      `INSERT INTO fertility.cycle_template (id, name_ar, name_en, cycle_type, protocol_id, owner_staff_id, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, cycle_type=EXCLUDED.cycle_type,
         protocol_id=EXCLUDED.protocol_id, owner_staff_id=EXCLUDED.owner_staff_id, active=EXCLUDED.active`,
      [t.id, t.name.ar, t.name.en, t.cycleType, t.protocolId, t.ownerStaffId, t.active],
    );
  }
}

interface TemplateRow {
  id: string;
  name_ar: string;
  name_en: string;
  cycle_type: string;
  protocol_id: string | null;
  owner_staff_id: string | null;
  active: boolean;
}

function fromRow(r: TemplateRow): CycleTemplate {
  return {
    id: r.id,
    name: { ar: r.name_ar, en: r.name_en },
    cycleType: r.cycle_type as CycleType,
    protocolId: r.protocol_id,
    ownerStaffId: r.owner_staff_id,
    active: r.active,
  };
}
