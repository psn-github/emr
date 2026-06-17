import { describe, expect, it } from "vitest";
import { predictFromDay, type PredictInputs } from "./predictive-prompts.js";

const day = (over: Partial<PredictInputs> = {}): PredictInputs => ({ follicles: [], endocrine: {}, ...over });

describe("predictive prompts (pure, advisory)", () => {
  it("expected oocyte range comes from the leading (≥11mm) follicle cohort", () => {
    const p = predictFromDay(day({ follicles: [{ ovary: "left", sizesMm: [12, 14, 8] }, { ovary: "right", sizesMm: [11, 9] }] }));
    expect(p.follicleCount).toBe(5);
    expect(p.leadFollicleCount).toBe(3); // 12, 14, 11
    expect(p.expectedOocyteRange).toEqual({ min: 2, max: 3 }); // floor(3*0.7)=2, ceil(3*1.0)=3
    expect(p.ohssRisk).toBe("low");
    expect(p.ohssFlags).toEqual([]);
  });

  it("flags moderate OHSS risk on follicle count or E2", () => {
    expect(predictFromDay(day({ follicles: [{ ovary: "left", sizesMm: Array(16).fill(10) }] })).ohssRisk).toBe("moderate");
    expect(predictFromDay(day({ endocrine: { e2: 2600 } })).ohssRisk).toBe("moderate");
    expect(predictFromDay(day({ endocrine: { e2: 2600 } })).ohssFlags).toEqual(["moderate_e2"]);
  });

  it("flags high OHSS risk and lists both contributing flags", () => {
    const p = predictFromDay(day({ follicles: [{ ovary: "left", sizesMm: Array(22).fill(12) }], endocrine: { e2: 4000 } }));
    expect(p.ohssRisk).toBe("high");
    expect(p.ohssFlags).toEqual(["high_follicle_count", "high_e2"]);
  });

  it("a high count keeps risk high even when E2 is only moderate", () => {
    const p = predictFromDay(day({ follicles: [{ ovary: "left", sizesMm: Array(20).fill(12) }], endocrine: { e2: 2600 } }));
    expect(p.ohssRisk).toBe("high");
    expect(p.ohssFlags).toEqual(["high_follicle_count", "moderate_e2"]);
  });

  it("honours custom thresholds", () => {
    const p = predictFromDay(
      day({ follicles: [{ ovary: "left", sizesMm: [10, 10] }] }),
      { leadFollicleMinMm: 9, lowFactor: 1, highFactor: 1 },
      { moderateFollicleCount: 2, highFollicleCount: 3, moderateE2: 1000, highE2: 2000 },
    );
    expect(p.leadFollicleCount).toBe(2);
    expect(p.expectedOocyteRange).toEqual({ min: 2, max: 2 });
    expect(p.ohssRisk).toBe("moderate"); // 2 follicles ≥ moderate threshold
  });
});
