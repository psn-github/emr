// Financial-dashboard read-model shaping (docs/01 §E12, ADR-0039). Pure: shapes
// supplied rows into ageing buckets, revenue-by-line, and instalment-risk
// summaries. Money is integer fils. No domain imports. 100% coverage.
import { rate } from "./kpi.js";

export interface AgeingItem {
  readonly balanceFils: number;
  readonly ageDays: number;
}
export interface AgeingBuckets {
  readonly current: number; // ≤ 30 days
  readonly d31_60: number;
  readonly d61_90: number;
  readonly d90plus: number;
  readonly totalFils: number;
}

/** Bucket outstanding balances by age (days): current ≤30, 31–60, 61–90, 90+. */
export function ageingBuckets(items: readonly AgeingItem[]): AgeingBuckets {
  const b = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0, totalFils: 0 };
  for (const i of items) {
    b.totalFils += i.balanceFils;
    if (i.ageDays <= 30) b.current += i.balanceFils;
    else if (i.ageDays <= 60) b.d31_60 += i.balanceFils;
    else if (i.ageDays <= 90) b.d61_90 += i.balanceFils;
    else b.d90plus += i.balanceFils;
  }
  return b;
}

// Revenue leakage (docs/01 §E11 P2): billable work that was recorded but never
// rolled into an invoice (recognised=false, not invoiced) is lost/at-risk revenue.
// The older the leaked charge, the more likely it is truly lost.
export interface LeakageCharge {
  readonly source: string; // ChargeSource (clinical/lab/theatre/pharmacy)
  readonly amountFils: number;
  readonly ageDays: number;
  /** True when covered by a package inclusion (not separately billable). */
  readonly recognised: boolean;
  /** True once rolled into an invoice. */
  readonly invoiced: boolean;
}
export interface LeakageBySource {
  readonly source: string;
  readonly amountFils: number;
  readonly count: number;
}
export interface LeakageReport {
  readonly leakedCount: number;
  readonly totalFils: number;
  readonly bySource: readonly LeakageBySource[];
  /** Subset of leaked value older than the aged-over threshold (likely lost). */
  readonly agedFils: number;
}

/** Detect revenue leakage: billable (not recognised), uninvoiced charges, grouped
 *  by source with an aged subset older than `agedOverDays` (default 30). */
export function revenueLeakage(charges: readonly LeakageCharge[], agedOverDays = 30): LeakageReport {
  const bySource = new Map<string, { amountFils: number; count: number }>();
  let totalFils = 0;
  let leakedCount = 0;
  let agedFils = 0;
  for (const c of charges) {
    if (c.recognised || c.invoiced) continue; // not leakage
    leakedCount += 1;
    totalFils += c.amountFils;
    if (c.ageDays > agedOverDays) agedFils += c.amountFils;
    const cur = bySource.get(c.source) ?? { amountFils: 0, count: 0 };
    bySource.set(c.source, { amountFils: cur.amountFils + c.amountFils, count: cur.count + 1 });
  }
  return {
    leakedCount,
    totalFils,
    agedFils,
    bySource: [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, v]) => ({ source, ...v })),
  };
}

export interface RevenueRow {
  readonly line: string;
  readonly amountFils: number;
}

/** Sum amounts by line (e.g. charge source / service line), sorted by line. */
export function revenueByLine(rows: readonly RevenueRow[]): readonly RevenueRow[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.line, (totals.get(r.line) ?? 0) + r.amountFils);
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([line, amountFils]) => ({ line, amountFils }));
}

export interface InstalmentRisk {
  readonly plansInArrears: number;
  readonly totalArrearsFils: number;
}

/** Summarise instalment-plan arrears (count + total of plans currently in arrears). */
export function instalmentRisk(arrears: readonly number[]): InstalmentRisk {
  let plansInArrears = 0;
  let totalArrearsFils = 0;
  for (const a of arrears) {
    if (a > 0) {
      plansInArrears += 1;
      totalArrearsFils += a;
    }
  }
  return { plansInArrears, totalArrearsFils };
}

/** Cycle disposition counts (from the fertility read-model). `cancelled` excludes
 *  conversions; `converted` counts new cycles created by a conversion. */
export interface DispositionCounts {
  readonly started: number;
  readonly cancelled: number;
  readonly converted: number;
  readonly cancelledByCategory: Readonly<Record<string, number>>;
}
export interface DispositionReport {
  readonly started: number;
  readonly cancellationRate: number; // true cancellations / started (conversions excluded)
  readonly conversionRate: number; // conversions / started
  readonly cancelledByCategory: Readonly<Record<string, number>>;
}

/** Cancellation rate (conversions excluded) and conversion rate from cycle counts. */
export function cycleDisposition(c: DispositionCounts): DispositionReport {
  return {
    started: c.started,
    cancellationRate: rate(c.cancelled, c.started),
    conversionRate: rate(c.converted, c.started),
    cancelledByCategory: c.cancelledByCategory,
  };
}
