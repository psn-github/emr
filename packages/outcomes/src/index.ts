// @oxford/outcomes — the fertility → pregnancy → live-birth continuum (docs/01
// §E3 outcome stage). Domain module: core + audit. Every record links back to
// the originating cycle; KPI inputs are captured (computation is Phase 5).
export type {
  PregnancyTestId,
  ClinicalAssessmentId,
  PregnancyOutcomeId,
  TestResult,
  PregnancyTest,
  ClinicalAssessment,
  OutcomeType,
  PregnancyOutcome,
  CycleOutcomeSummary,
  OutcomeKpiInputs,
} from "./types.js";
export {
  DEFAULT_BETA_HCG_POSITIVE_THRESHOLD,
  classifyBetaHcg,
  isClinicalPregnancy,
  deriveKpiInputs,
} from "./outcome-logic.js";
export { type OutcomesStore, InMemoryOutcomesStore } from "./store.js";
export { PgOutcomesStore } from "./pg-store.js";
export {
  OutcomesService,
  type RecordTestInput,
  type RecordAssessmentInput,
  type RecordOutcomeInput,
} from "./outcomes-service.js";
export { outcomesSchema, pregnancyTest, clinicalAssessment, pregnancyOutcome } from "./schema.js";
