// @oxford/analytics — KPI & outcome read models (docs/01 §E12, ADR-0039). Pure:
// counts in → Vienna-consensus lab KPIs (with competency/benchmark bands) and
// outcome rates. Thresholds are configuration. Depends only on core.
export {
  rate,
  bandFor,
  DEFAULT_LAB_KPI_THRESHOLDS,
  type KpiBand,
  type KpiThreshold,
  type LabCounts,
  type OutcomeCounts,
  type KpiResult,
} from "./kpi.js";
export { AnalyticsService, type OutcomeReport } from "./analytics-service.js";
