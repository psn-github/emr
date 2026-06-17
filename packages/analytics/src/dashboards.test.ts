import { describe, expect, it } from "vitest";
import { ageingBuckets, revenueByLine, instalmentRisk, revenueLeakage, cycleDisposition, type LeakageCharge } from "./dashboards.js";
import { AnalyticsService } from "./analytics-service.js";

describe("financial dashboard shaping (pure)", () => {
  it("buckets receivables by age", () => {
    const b = ageingBuckets([
      { balanceFils: 1000, ageDays: 5 },
      { balanceFils: 2000, ageDays: 30 },
      { balanceFils: 4000, ageDays: 45 },
      { balanceFils: 8000, ageDays: 75 },
      { balanceFils: 16000, ageDays: 120 },
    ]);
    expect(b).toEqual({ current: 3000, d31_60: 4000, d61_90: 8000, d90plus: 16000, totalFils: 31000 });
  });

  it("detects revenue leakage (billable + uninvoiced), grouped by source with an aged subset", () => {
    const charges: readonly LeakageCharge[] = [
      { source: "lab", amountFils: 5000, ageDays: 10, recognised: false, invoiced: false }, // leaked, recent
      { source: "lab", amountFils: 3000, ageDays: 45, recognised: false, invoiced: false }, // leaked, aged
      { source: "theatre", amountFils: 20000, ageDays: 60, recognised: false, invoiced: false }, // leaked, aged
      { source: "clinical", amountFils: 9000, ageDays: 100, recognised: false, invoiced: true }, // invoiced → excluded
      { source: "clinical", amountFils: 7000, ageDays: 100, recognised: true, invoiced: false }, // package-covered → excluded
    ];
    const r = revenueLeakage(charges); // default agedOverDays = 30
    expect(r.leakedCount).toBe(3);
    expect(r.totalFils).toBe(28000);
    expect(r.agedFils).toBe(23000); // 3000 + 20000 older than 30 days
    expect(r.bySource).toEqual([
      { source: "lab", amountFils: 8000, count: 2 },
      { source: "theatre", amountFils: 20000, count: 1 },
    ]);
    // a custom horizon shifts the aged subset
    expect(revenueLeakage(charges, 90).agedFils).toBe(0);
  });
  it("groups + sums revenue by line (sorted)", () => {
    expect(revenueByLine([
      { line: "theatre", amountFils: 500000 },
      { line: "clinical", amountFils: 25000 },
      { line: "clinical", amountFils: 25000 },
      { line: "lab", amountFils: 8000 },
    ])).toEqual([
      { line: "clinical", amountFils: 50000 },
      { line: "lab", amountFils: 8000 },
      { line: "theatre", amountFils: 500000 },
    ]);
  });
  it("summarises instalment arrears risk (only plans in arrears count)", () => {
    expect(instalmentRisk([0, 200000, 0, 400000])).toEqual({ plansInArrears: 2, totalArrearsFils: 600000 });
    expect(instalmentRisk([])).toEqual({ plansInArrears: 0, totalArrearsFils: 0 });
  });
  it("computes cycle disposition: cancellation rate (by category) + conversion rate", () => {
    const report = cycleDisposition({ started: 10, cancelled: 2, converted: 3, cancelledByCategory: { poor_response: 1, patient_choice: 1 } });
    expect(report).toEqual({
      started: 10,
      cancellationRate: 0.2,
      conversionRate: 0.3,
      cancelledByCategory: { poor_response: 1, patient_choice: 1 },
    });
  });
  it("guards divide-by-zero when no cycles started", () => {
    expect(cycleDisposition({ started: 0, cancelled: 0, converted: 0, cancelledByCategory: {} })).toEqual({
      started: 0, cancellationRate: 0, conversionRate: 0, cancelledByCategory: {},
    });
  });
  it("is exposed via AnalyticsService", () => {
    const svc = new AnalyticsService();
    expect(svc.ageing([{ balanceFils: 100, ageDays: 10 }]).current).toBe(100);
    expect(svc.revenue([{ line: "x", amountFils: 5 }])).toEqual([{ line: "x", amountFils: 5 }]);
    expect(svc.instalmentRisk([0, 5]).plansInArrears).toBe(1);
    expect(svc.leakage([{ source: "lab", amountFils: 100, ageDays: 5, recognised: false, invoiced: false }]).totalFils).toBe(100);
    expect(svc.disposition({ started: 4, cancelled: 1, converted: 1, cancelledByCategory: { clinical: 1 } }).cancellationRate).toBe(0.25);
  });
});
