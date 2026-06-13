// Vienna-consensus IVF laboratory KPIs + outcome rates (docs/01 §E12, ADR-0039).
// Pure read-model computation: counts in → KPI value + competency/benchmark band.
// The competency/benchmark THRESHOLDS are configuration (clinic-overridable; the
// defaults follow the ESHRE/Alpha Vienna-consensus performance indicators and are
// confirmable). No domain imports — operates on plain counts. 100% coverage.

export type KpiBand = "below" | "competency" | "benchmark";

export interface KpiThreshold {
  /** Minimum acceptable (competency) value, as a ratio 0..1. */
  readonly competency: number;
  /** Aspirational (benchmark) value, as a ratio 0..1. */
  readonly benchmark: number;
}

export interface LabCounts {
  readonly oocytesRetrieved: number;
  readonly maturedOocytes: number;
  readonly inseminated: number;
  readonly twoPn: number;
  readonly blastocysts: number;
}

export interface OutcomeCounts {
  readonly cycles: number;
  readonly clinicalPregnancies: number;
  readonly liveBirths: number;
}

export interface KpiResult {
  readonly key: string;
  readonly value: number;
  readonly band: KpiBand;
  /** False when the denominator was zero (no data) — value/band are not meaningful. */
  readonly hasData: boolean;
}

/** A ratio with divide-by-zero guarded to 0. */
export function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Higher-is-better band: ≥ benchmark → benchmark; ≥ competency → competency; else below. */
export function bandFor(value: number, t: KpiThreshold): KpiBand {
  if (value >= t.benchmark) return "benchmark";
  if (value >= t.competency) return "competency";
  return "below";
}

/** Vienna-consensus default thresholds (config; ratios 0..1). */
export const DEFAULT_LAB_KPI_THRESHOLDS: Readonly<Record<string, KpiThreshold>> = {
  maturation_rate: { competency: 0.75, benchmark: 0.85 },
  fertilisation_rate: { competency: 0.65, benchmark: 0.8 },
  blastulation_rate: { competency: 0.3, benchmark: 0.4 },
};
