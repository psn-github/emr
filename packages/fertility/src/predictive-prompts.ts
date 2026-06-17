import type { Endocrine, FollicleMeasurement } from "./stimulation.js";

// Predictive prompts (docs/01 §E3 P2): expected oocyte-yield range + OHSS risk
// flags surfaced FROM STRUCTURED INPUTS (the monitoring day's follicle sizes +
// endocrine values). These are ADVISORY heuristics shown to the clinician — never
// an automated trigger/cancel/dose decision. Thresholds are configuration. Pure,
// 100% covered.

export interface YieldThresholds {
  /** Follicles ≥ this diameter (mm) make up the leading cohort that predicts yield. */
  readonly leadFollicleMinMm: number;
  readonly lowFactor: number;
  readonly highFactor: number;
}
export const DEFAULT_YIELD_THRESHOLDS: YieldThresholds = { leadFollicleMinMm: 11, lowFactor: 0.7, highFactor: 1.0 };

export interface OhssThresholds {
  readonly moderateFollicleCount: number;
  readonly highFollicleCount: number;
  readonly moderateE2: number;
  readonly highE2: number;
}
export const DEFAULT_OHSS_THRESHOLDS: OhssThresholds = { moderateFollicleCount: 15, highFollicleCount: 20, moderateE2: 2500, highE2: 3500 };

export type OhssRisk = "low" | "moderate" | "high";

export interface PredictivePrompts {
  readonly follicleCount: number;
  /** Follicles ≥ the lead threshold — the cohort predicting retrieved oocytes. */
  readonly leadFollicleCount: number;
  readonly expectedOocyteRange: { readonly min: number; readonly max: number };
  readonly ohssRisk: OhssRisk;
  readonly ohssFlags: readonly string[];
}

export interface PredictInputs {
  readonly follicles: readonly FollicleMeasurement[];
  readonly endocrine: Endocrine;
}

/** Compute advisory predictive prompts from a monitoring day's structured inputs. */
export function predictFromDay(
  input: PredictInputs,
  yieldThresholds: YieldThresholds = DEFAULT_YIELD_THRESHOLDS,
  ohss: OhssThresholds = DEFAULT_OHSS_THRESHOLDS,
): PredictivePrompts {
  const sizes = input.follicles.flatMap((f) => f.sizesMm);
  const follicleCount = sizes.length;
  const leadFollicleCount = sizes.filter((s) => s >= yieldThresholds.leadFollicleMinMm).length;
  const expectedOocyteRange = {
    min: Math.floor(leadFollicleCount * yieldThresholds.lowFactor),
    max: Math.ceil(leadFollicleCount * yieldThresholds.highFactor),
  };

  const ohssFlags: string[] = [];
  let ohssRisk: OhssRisk = "low";
  const bump = (level: OhssRisk): void => {
    if (level === "high") ohssRisk = "high";
    else if (level === "moderate" && ohssRisk !== "high") ohssRisk = "moderate";
  };
  if (follicleCount >= ohss.highFollicleCount) {
    ohssFlags.push("high_follicle_count");
    bump("high");
  } else if (follicleCount >= ohss.moderateFollicleCount) {
    ohssFlags.push("moderate_follicle_count");
    bump("moderate");
  }
  const e2 = input.endocrine.e2;
  if (e2 !== undefined) {
    if (e2 >= ohss.highE2) {
      ohssFlags.push("high_e2");
      bump("high");
    } else if (e2 >= ohss.moderateE2) {
      ohssFlags.push("moderate_e2");
      bump("moderate");
    }
  }
  return { follicleCount, leadFollicleCount, expectedOocyteRange, ohssRisk, ohssFlags };
}
