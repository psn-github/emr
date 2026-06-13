import { describe, expect, it } from "vitest";
import { rate, bandFor, DEFAULT_LAB_KPI_THRESHOLDS } from "./kpi.js";
import { AnalyticsService } from "./analytics-service.js";

describe("KPI math (pure)", () => {
  it("rate guards divide-by-zero", () => {
    expect(rate(8, 10)).toBe(0.8);
    expect(rate(5, 0)).toBe(0);
  });
  it("bands by competency/benchmark (higher is better)", () => {
    const t = { competency: 0.65, benchmark: 0.8 };
    expect(bandFor(0.85, t)).toBe("benchmark");
    expect(bandFor(0.8, t)).toBe("benchmark");
    expect(bandFor(0.7, t)).toBe("competency");
    expect(bandFor(0.65, t)).toBe("competency");
    expect(bandFor(0.5, t)).toBe("below");
  });
});

describe("AnalyticsService", () => {
  it("computes lab KPIs with bands from counts", () => {
    const svc = new AnalyticsService();
    const kpis = svc.labKpis({ oocytesRetrieved: 10, maturedOocytes: 9, inseminated: 9, twoPn: 7, blastocysts: 3 });
    const byKey = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(byKey.maturation_rate!.value).toBe(0.9);
    expect(byKey.maturation_rate!.band).toBe("benchmark"); // 0.9 ≥ 0.85
    expect(byKey.fertilisation_rate!.value).toBeCloseTo(0.7778, 3);
    expect(byKey.fertilisation_rate!.band).toBe("competency"); // 0.78 in [0.65,0.8)
    expect(byKey.blastulation_rate!.value).toBeCloseTo(0.4286, 3);
    expect(byKey.blastulation_rate!.band).toBe("benchmark"); // ≥ 0.4
  });

  it("marks hasData false when a denominator is zero", () => {
    const svc = new AnalyticsService();
    const kpis = svc.labKpis({ oocytesRetrieved: 0, maturedOocytes: 0, inseminated: 0, twoPn: 0, blastocysts: 0 });
    expect(kpis.every((k) => k.hasData === false)).toBe(true);
    expect(kpis.every((k) => k.value === 0 && k.band === "below")).toBe(true);
  });

  it("honours threshold overrides", () => {
    const svc = new AnalyticsService({ fertilisation_rate: { competency: 0.5, benchmark: 0.6 } });
    const kpis = svc.labKpis({ oocytesRetrieved: 10, maturedOocytes: 9, inseminated: 9, twoPn: 5, blastocysts: 1 });
    const fert = kpis.find((k) => k.key === "fertilisation_rate")!;
    expect(fert.value).toBeCloseTo(0.5556, 3);
    expect(fert.band).toBe("competency"); // ≥ 0.5 under the override (would be "below" by default)
    // an un-overridden key still uses the default threshold
    expect(DEFAULT_LAB_KPI_THRESHOLDS.maturation_rate!.benchmark).toBe(0.85);
  });

  it("computes outcome rates per cycle", () => {
    const svc = new AnalyticsService();
    expect(svc.outcomeReport({ cycles: 20, clinicalPregnancies: 9, liveBirths: 7 })).toEqual({ cycles: 20, clinicalPregnancyRate: 0.45, liveBirthRate: 0.35 });
    expect(svc.outcomeReport({ cycles: 0, clinicalPregnancies: 0, liveBirths: 0 })).toEqual({ cycles: 0, clinicalPregnancyRate: 0, liveBirthRate: 0 });
  });
});
