import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { CycleOutcomeSummary, OutcomeKpiInputs, TestResult } from "./types.js";

// Pure outcome logic (100%). Clinical thresholds are CONFIGURATION (the default
// positive β-hCG threshold is overridable per clinic protocol).

/** Default positive serum β-hCG threshold (mIU/mL). Configurable per protocol. */
export const DEFAULT_BETA_HCG_POSITIVE_THRESHOLD = 25;

/** Classify a serum β-hCG value as a positive/negative pregnancy test. */
export function classifyBetaHcg(value: number, threshold: number = DEFAULT_BETA_HCG_POSITIVE_THRESHOLD): Result<TestResult, AppError> {
  if (!Number.isFinite(value) || value < 0) {
    return err(validationError("β-hCG must be a non-negative number", "outcomes.beta_hcg.bad_value"));
  }
  return ok(value >= threshold ? "positive" : "negative");
}

/** A clinical pregnancy requires ≥1 gestational sac on scan (vs biochemical only). */
export function isClinicalPregnancy(gestationalSacs: number): boolean {
  return gestationalSacs >= 1;
}

/** Derive the Vienna-consensus KPI input booleans from a cycle's continuum. */
export function deriveKpiInputs(summary: CycleOutcomeSummary): OutcomeKpiInputs {
  return {
    biochemicalPregnancy: summary.test?.result === "positive",
    clinicalPregnancy: summary.clinicalAssessment?.clinicalPregnancy === true,
    liveBirth: summary.outcome?.type === "live_birth",
    ongoing: summary.outcome?.type === "ongoing",
  };
}
