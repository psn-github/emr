import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { DrugDoseInput } from "./stim-validate.js";
import type { Endocrine, FollicleMeasurement, StimulationDay } from "./stimulation.js";
import type { StimStore } from "./stim-store.js";

/** Postgres-backed StimStore. One row per (cycle, day). */
export class PgStimStore implements StimStore {
  constructor(private readonly pool: Pool) {}

  async saveDay(d: StimulationDay): Promise<void> {
    await this.pool.query(
      `INSERT INTO fertility.stim_day (id, cycle_id, day, drugs, follicles, endometrium_mm, endocrine, recorded_by, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (cycle_id, day) DO UPDATE SET drugs=EXCLUDED.drugs, follicles=EXCLUDED.follicles, endometrium_mm=EXCLUDED.endometrium_mm, endocrine=EXCLUDED.endocrine, recorded_by=EXCLUDED.recorded_by, at=EXCLUDED.at`,
      [d.id, d.cycleId, d.day, JSON.stringify(d.drugs), JSON.stringify(d.follicles), d.endometriumMm, JSON.stringify(d.endocrine), d.recordedBy, d.at],
    );
  }

  async daysForCycle(cycleId: string): Promise<readonly StimulationDay[]> {
    const r = await this.pool.query<StimRow>("SELECT * FROM fertility.stim_day WHERE cycle_id = $1 ORDER BY day", [cycleId]);
    return r.rows.map(fromRow);
  }
}

interface StimRow {
  id: string;
  cycle_id: string;
  day: number;
  drugs: DrugDoseInput[];
  follicles: FollicleMeasurement[];
  endometrium_mm: number | null;
  endocrine: Endocrine;
  recorded_by: string;
  at: Date;
}

function fromRow(r: StimRow): StimulationDay {
  return {
    id: asId<"StimulationDay">(r.id),
    cycleId: r.cycle_id,
    day: r.day,
    drugs: r.drugs,
    follicles: r.follicles,
    endometriumMm: r.endometrium_mm,
    endocrine: r.endocrine,
    recordedBy: r.recorded_by,
    at: new Date(r.at).toISOString(),
  };
}
