import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { SemenFlags, SemenParameters, ReferenceFlag } from "./types.js";

// WHO 6th-edition (2021) semen analysis flagging (pure, 100%). Reference limits
// are CONFIGURATION (CLAUDE.md "configuration is data") — the WHO 6th constant
// is the default, but a clinic may pass its own versioned limits. A value below
// its lower reference limit flags `below_reference`; a value exactly AT the limit
// is normal (the limits are inclusive lower bounds).

export interface ReferenceLimits {
  readonly volumeMl: number;
  readonly concentrationMillionPerMl: number;
  readonly totalCountMillion: number;
  readonly progressiveMotilityPct: number;
  readonly totalMotilityPct: number;
  readonly normalMorphologyPct: number;
  readonly vitalityPct: number;
}

/** WHO 2021 6th-edition lower reference limits (5th centile). */
export const WHO_6TH_LOWER_LIMITS: ReferenceLimits = {
  volumeMl: 1.4,
  concentrationMillionPerMl: 16,
  totalCountMillion: 39,
  progressiveMotilityPct: 30,
  totalMotilityPct: 42,
  normalMorphologyPct: 4,
  vitalityPct: 54,
};

const flag = (value: number, lowerLimit: number): ReferenceFlag => (value < lowerLimit ? "below_reference" : "normal");

const PARAM_KEYS = [
  "volumeMl",
  "concentrationMillionPerMl",
  "totalCountMillion",
  "progressiveMotilityPct",
  "totalMotilityPct",
  "normalMorphologyPct",
  "vitalityPct",
] as const satisfies readonly (keyof SemenParameters)[];

const PERCENT_KEYS: ReadonlySet<keyof SemenParameters> = new Set([
  "progressiveMotilityPct",
  "totalMotilityPct",
  "normalMorphologyPct",
  "vitalityPct",
]);

/** Validate the measured parameters (no negatives; percentages within 0–100). */
export function validateSemenParameters(p: SemenParameters): Result<void, AppError> {
  for (const k of PARAM_KEYS) {
    const v = p[k];
    if (!Number.isFinite(v) || v < 0) {
      return err(validationError(`${k} must be a non-negative number`, "andrology.semen.bad_value"));
    }
    if (PERCENT_KEYS.has(k) && v > 100) {
      return err(validationError(`${k} must be a percentage 0–100`, "andrology.semen.bad_percentage"));
    }
  }
  return ok(undefined);
}

/** Flag each parameter against the reference limits (WHO 6th by default). */
export function flagSemen(p: SemenParameters, limits: ReferenceLimits = WHO_6TH_LOWER_LIMITS): SemenFlags {
  return {
    volume: flag(p.volumeMl, limits.volumeMl),
    concentration: flag(p.concentrationMillionPerMl, limits.concentrationMillionPerMl),
    totalCount: flag(p.totalCountMillion, limits.totalCountMillion),
    progressiveMotility: flag(p.progressiveMotilityPct, limits.progressiveMotilityPct),
    totalMotility: flag(p.totalMotilityPct, limits.totalMotilityPct),
    normalMorphology: flag(p.normalMorphologyPct, limits.normalMorphologyPct),
    vitality: flag(p.vitalityPct, limits.vitalityPct),
  };
}

/** Are all flags normal? */
export function allWithinReference(flags: SemenFlags): boolean {
  return Object.values(flags).every((f) => f === "normal");
}
