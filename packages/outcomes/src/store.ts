import type { PregnancyTest, ClinicalAssessment, PregnancyOutcome } from "./types.js";

export interface OutcomesStore {
  saveTest(t: PregnancyTest): Promise<void>;
  testsForCycle(cycleId: string): Promise<readonly PregnancyTest[]>;
  saveAssessment(a: ClinicalAssessment): Promise<void>;
  assessmentsForCycle(cycleId: string): Promise<readonly ClinicalAssessment[]>;
  saveOutcome(o: PregnancyOutcome): Promise<void>;
  outcomesForCycle(cycleId: string): Promise<readonly PregnancyOutcome[]>;
}

export class InMemoryOutcomesStore implements OutcomesStore {
  private readonly tests: PregnancyTest[] = [];
  private readonly assessments: ClinicalAssessment[] = [];
  private readonly outcomes: PregnancyOutcome[] = [];

  async saveTest(t: PregnancyTest): Promise<void> {
    this.tests.push(t);
  }
  async testsForCycle(cycleId: string): Promise<readonly PregnancyTest[]> {
    return this.tests.filter((t) => t.cycleId === cycleId);
  }
  async saveAssessment(a: ClinicalAssessment): Promise<void> {
    this.assessments.push(a);
  }
  async assessmentsForCycle(cycleId: string): Promise<readonly ClinicalAssessment[]> {
    return this.assessments.filter((a) => a.cycleId === cycleId);
  }
  async saveOutcome(o: PregnancyOutcome): Promise<void> {
    this.outcomes.push(o);
  }
  async outcomesForCycle(cycleId: string): Promise<readonly PregnancyOutcome[]> {
    return this.outcomes.filter((o) => o.cycleId === cycleId);
  }
}
