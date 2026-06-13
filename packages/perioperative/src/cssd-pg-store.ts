import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { InstrumentSet, InstrumentSetId, SterilisationCycle, SetUsage } from "./types.js";
import type { CssdStore } from "./cssd-store.js";

/** Postgres-backed CssdStore (sets, sterilisation cycles, usages). */
export class PgCssdStore implements CssdStore {
  constructor(private readonly pool: Pool) {}

  async saveSet(s: InstrumentSet): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.instrument_set (id, name, composition, status)
       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [s.id, s.name, JSON.stringify(s.composition), s.status],
    );
  }
  async getSet(id: InstrumentSetId): Promise<InstrumentSet | undefined> {
    const r = await this.pool.query<SetRow>("SELECT * FROM perioperative.instrument_set WHERE id = $1", [id]);
    return r.rows[0] ? setFrom(r.rows[0]) : undefined;
  }
  async saveCycle(c: SterilisationCycle): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.sterilisation_cycle (id, set_id, cycle_type, load_ref, result, completed_at, operator)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.setId, c.cycleType, c.loadRef, c.result, c.completedAt, c.operator],
    );
  }
  async cyclesForSet(setId: InstrumentSetId): Promise<readonly SterilisationCycle[]> {
    const r = await this.pool.query<CycleRow>("SELECT * FROM perioperative.sterilisation_cycle WHERE set_id = $1 ORDER BY completed_at", [setId]);
    return r.rows.map(cycleFrom);
  }
  async saveUsage(u: SetUsage): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.set_usage (id, set_id, encounter_id, sterilisation_cycle_id, used_at, used_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.setId, u.encounterId, u.sterilisationCycleId, u.usedAt, u.usedBy],
    );
  }
  async usagesForSet(setId: InstrumentSetId): Promise<readonly SetUsage[]> {
    const r = await this.pool.query<UsageRow>("SELECT * FROM perioperative.set_usage WHERE set_id = $1 ORDER BY used_at", [setId]);
    return r.rows.map(usageFrom);
  }
  async usagesForEncounter(encounterId: string): Promise<readonly SetUsage[]> {
    const r = await this.pool.query<UsageRow>("SELECT * FROM perioperative.set_usage WHERE encounter_id = $1 ORDER BY used_at", [encounterId]);
    return r.rows.map(usageFrom);
  }
}

interface SetRow { id: string; name: string; composition: string[]; status: string }
interface CycleRow { id: string; set_id: string; cycle_type: string; load_ref: string; result: string; completed_at: Date; operator: string }
interface UsageRow { id: string; set_id: string; encounter_id: string; sterilisation_cycle_id: string; used_at: Date; used_by: string }

const iso = (d: Date): string => new Date(d).toISOString();
function setFrom(r: SetRow): InstrumentSet {
  return { id: asId<"InstrumentSet">(r.id), name: r.name, composition: r.composition, status: r.status as InstrumentSet["status"] };
}
function cycleFrom(r: CycleRow): SterilisationCycle {
  return { id: asId<"SterilisationCycle">(r.id), setId: asId<"InstrumentSet">(r.set_id), cycleType: r.cycle_type, loadRef: r.load_ref, result: r.result as SterilisationCycle["result"], completedAt: iso(r.completed_at), operator: r.operator };
}
function usageFrom(r: UsageRow): SetUsage {
  return { id: asId<"SetUsage">(r.id), setId: asId<"InstrumentSet">(r.set_id), encounterId: r.encounter_id, sterilisationCycleId: r.sterilisation_cycle_id, usedAt: iso(r.used_at), usedBy: r.used_by };
}
