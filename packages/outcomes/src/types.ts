import type { Id } from "@oxford/core";

// Outcome tracking (docs/01 §E3 cycle outcome stage; reporting line 229; the
// fertility → pregnancy → live-birth continuum). Every record links back to the
// ORIGINATING cycle by `cycleId`. KPI computation is Phase 5; the inputs
// (biochemical/clinical pregnancy, live birth) are captured here.

export type PregnancyTestId = Id<"PregnancyTest">;
export type ClinicalAssessmentId = Id<"ClinicalAssessment">;
export type PregnancyOutcomeId = Id<"PregnancyOutcome">;

export type TestResult = "positive" | "negative";

export interface PregnancyTest {
  readonly id: PregnancyTestId;
  readonly cycleId: string;
  readonly betaHcgMiuMl: number;
  readonly result: TestResult;
  readonly testedAt: string;
  readonly recordedBy: string;
}

export interface ClinicalAssessment {
  readonly id: ClinicalAssessmentId;
  readonly cycleId: string;
  readonly gestationalSacs: number;
  readonly fetalHeartbeats: number;
  /** ≥1 gestational sac on scan — a clinical pregnancy (vs biochemical only). */
  readonly clinicalPregnancy: boolean;
  readonly assessedAt: string;
  readonly recordedBy: string;
}

/** Terminal pregnancy outcome for a cycle. `ongoing` is an interim state. */
export type OutcomeType = "live_birth" | "miscarriage" | "ectopic" | "stillbirth" | "termination" | "ongoing";

export interface PregnancyOutcome {
  readonly id: PregnancyOutcomeId;
  readonly cycleId: string;
  readonly type: OutcomeType;
  readonly liveBirthCount: number;
  readonly gestationalAgeWeeks: number | null;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly recordedBy: string;
}

/** The reconstructed continuum for one cycle. */
export interface CycleOutcomeSummary {
  readonly cycleId: string;
  readonly test: PregnancyTest | null;
  readonly clinicalAssessment: ClinicalAssessment | null;
  readonly outcome: PregnancyOutcome | null;
}

/** Vienna-consensus KPI input booleans derived from a cycle's continuum. */
export interface OutcomeKpiInputs {
  readonly biochemicalPregnancy: boolean;
  readonly clinicalPregnancy: boolean;
  readonly liveBirth: boolean;
  readonly ongoing: boolean;
}
