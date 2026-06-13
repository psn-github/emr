import { rate, bandFor, DEFAULT_LAB_KPI_THRESHOLDS, type KpiThreshold, type LabCounts, type OutcomeCounts, type KpiResult } from "./kpi.js";
import { ageingBuckets, revenueByLine, instalmentRisk, type AgeingItem, type AgeingBuckets, type RevenueRow, type InstalmentRisk } from "./dashboards.js";

export interface OutcomeReport {
  readonly cycles: number;
  readonly clinicalPregnancyRate: number;
  readonly liveBirthRate: number;
}

/**
 * Analytics read model (docs/01 §E12). Computes Vienna-consensus lab KPIs (with
 * competency/benchmark bands) and clinical-outcome rates from supplied counts —
 * no source of truth of its own, no cross-module table access. Thresholds are
 * configuration (defaults merged with any clinic overrides).
 */
export class AnalyticsService {
  private readonly thresholds: Record<string, KpiThreshold>;

  constructor(overrides: Readonly<Record<string, KpiThreshold>> = {}) {
    this.thresholds = { ...DEFAULT_LAB_KPI_THRESHOLDS, ...overrides };
  }

  /** Lab KPIs from a (possibly aggregated) count set. */
  labKpis(counts: LabCounts): readonly KpiResult[] {
    return [
      this.kpi("maturation_rate", counts.maturedOocytes, counts.oocytesRetrieved),
      this.kpi("fertilisation_rate", counts.twoPn, counts.inseminated),
      this.kpi("blastulation_rate", counts.blastocysts, counts.twoPn),
    ];
  }

  /** Clinical-outcome rates per cycle (de-identifiable aggregate). */
  outcomeReport(counts: OutcomeCounts): OutcomeReport {
    return {
      cycles: counts.cycles,
      clinicalPregnancyRate: rate(counts.clinicalPregnancies, counts.cycles),
      liveBirthRate: rate(counts.liveBirths, counts.cycles),
    };
  }

  /** Financial dashboard: receivables ageing buckets. */
  ageing(items: readonly AgeingItem[]): AgeingBuckets {
    return ageingBuckets(items);
  }
  /** Financial dashboard: revenue grouped by service line. */
  revenue(rows: readonly RevenueRow[]): readonly RevenueRow[] {
    return revenueByLine(rows);
  }
  /** Financial dashboard: instalment-plan arrears risk. */
  instalmentRisk(arrears: readonly number[]): InstalmentRisk {
    return instalmentRisk(arrears);
  }

  private kpi(key: string, numerator: number, denominator: number): KpiResult {
    const value = rate(numerator, denominator);
    return { key, value, band: bandFor(value, this.thresholds[key]!), hasData: denominator > 0 };
  }
}
