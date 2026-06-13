import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { PregnancyTest, ClinicalAssessment, PregnancyOutcome } from "./types.js";
import type { OutcomesStore } from "./store.js";

/** Postgres-backed OutcomesStore. Clinical data is append-only; inserts only. */
export class PgOutcomesStore implements OutcomesStore {
  constructor(private readonly pool: Pool) {}

  async saveTest(t: PregnancyTest): Promise<void> {
    await this.pool.query(
      `INSERT INTO outcomes.pregnancy_test (id, cycle_id, beta_hcg_miu_ml, result, tested_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.cycleId, t.betaHcgMiuMl, t.result, t.testedAt, t.recordedBy],
    );
  }
  async testsForCycle(cycleId: string): Promise<readonly PregnancyTest[]> {
    const r = await this.pool.query<TestRow>("SELECT * FROM outcomes.pregnancy_test WHERE cycle_id = $1 ORDER BY tested_at", [cycleId]);
    return r.rows.map(testFrom);
  }
  async saveAssessment(a: ClinicalAssessment): Promise<void> {
    await this.pool.query(
      `INSERT INTO outcomes.clinical_assessment (id, cycle_id, gestational_sacs, fetal_heartbeats, clinical_pregnancy, assessed_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.cycleId, a.gestationalSacs, a.fetalHeartbeats, a.clinicalPregnancy, a.assessedAt, a.recordedBy],
    );
  }
  async assessmentsForCycle(cycleId: string): Promise<readonly ClinicalAssessment[]> {
    const r = await this.pool.query<AssessRow>("SELECT * FROM outcomes.clinical_assessment WHERE cycle_id = $1 ORDER BY assessed_at", [cycleId]);
    return r.rows.map(assessFrom);
  }
  async saveOutcome(o: PregnancyOutcome): Promise<void> {
    await this.pool.query(
      `INSERT INTO outcomes.pregnancy_outcome (id, cycle_id, type, live_birth_count, gestational_age_weeks, occurred_at, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [o.id, o.cycleId, o.type, o.liveBirthCount, o.gestationalAgeWeeks, o.occurredAt, o.note, o.recordedBy],
    );
  }
  async outcomesForCycle(cycleId: string): Promise<readonly PregnancyOutcome[]> {
    const r = await this.pool.query<OutcomeRow>("SELECT * FROM outcomes.pregnancy_outcome WHERE cycle_id = $1 ORDER BY occurred_at", [cycleId]);
    return r.rows.map(outcomeFrom);
  }
}

interface TestRow { id: string; cycle_id: string; beta_hcg_miu_ml: number; result: string; tested_at: Date; recorded_by: string }
interface AssessRow { id: string; cycle_id: string; gestational_sacs: number; fetal_heartbeats: number; clinical_pregnancy: boolean; assessed_at: Date; recorded_by: string }
interface OutcomeRow { id: string; cycle_id: string; type: string; live_birth_count: number; gestational_age_weeks: number | null; occurred_at: Date; note: string | null; recorded_by: string }

const iso = (d: Date): string => new Date(d).toISOString();

function testFrom(r: TestRow): PregnancyTest {
  return { id: asId<"PregnancyTest">(r.id), cycleId: r.cycle_id, betaHcgMiuMl: r.beta_hcg_miu_ml, result: r.result as PregnancyTest["result"], testedAt: iso(r.tested_at), recordedBy: r.recorded_by };
}
function assessFrom(r: AssessRow): ClinicalAssessment {
  return { id: asId<"ClinicalAssessment">(r.id), cycleId: r.cycle_id, gestationalSacs: r.gestational_sacs, fetalHeartbeats: r.fetal_heartbeats, clinicalPregnancy: r.clinical_pregnancy, assessedAt: iso(r.assessed_at), recordedBy: r.recorded_by };
}
function outcomeFrom(r: OutcomeRow): PregnancyOutcome {
  return { id: asId<"PregnancyOutcome">(r.id), cycleId: r.cycle_id, type: r.type as PregnancyOutcome["type"], liveBirthCount: r.live_birth_count, gestationalAgeWeeks: r.gestational_age_weeks, occurredAt: iso(r.occurred_at), note: r.note, recordedBy: r.recorded_by };
}
