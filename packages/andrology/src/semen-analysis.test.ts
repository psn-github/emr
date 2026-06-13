import { describe, expect, it } from "vitest";
import {
  WHO_6TH_LOWER_LIMITS,
  validateSemenParameters,
  flagSemen,
  allWithinReference,
  type ReferenceLimits,
} from "./semen-analysis.js";
import type { SemenParameters } from "./types.js";

// A sample exactly AT the WHO 6th lower limits — every parameter is normal
// (limits are inclusive lower bounds).
const atLimit: SemenParameters = {
  volumeMl: 1.4,
  concentrationMillionPerMl: 16,
  totalCountMillion: 39,
  progressiveMotilityPct: 30,
  totalMotilityPct: 42,
  normalMorphologyPct: 4,
  vitalityPct: 54,
};

// Every parameter just below its limit — every flag must be below_reference.
const allBelow: SemenParameters = {
  volumeMl: 1.3,
  concentrationMillionPerMl: 15,
  totalCountMillion: 38,
  progressiveMotilityPct: 29,
  totalMotilityPct: 41,
  normalMorphologyPct: 3,
  vitalityPct: 53,
};

describe("WHO 6th-ed semen flagging", () => {
  it("flags every parameter normal when exactly at the lower limit", () => {
    const flags = flagSemen(atLimit);
    expect(Object.values(flags).every((f) => f === "normal")).toBe(true);
    expect(allWithinReference(flags)).toBe(true);
  });

  it("flags every parameter below_reference one step under the limit", () => {
    const flags = flagSemen(allBelow);
    expect(flags).toEqual({
      volume: "below_reference",
      concentration: "below_reference",
      totalCount: "below_reference",
      progressiveMotility: "below_reference",
      totalMotility: "below_reference",
      normalMorphology: "below_reference",
      vitality: "below_reference",
    });
    expect(allWithinReference(flags)).toBe(false);
  });

  it("exposes the WHO 6th-edition lower reference limits", () => {
    expect(WHO_6TH_LOWER_LIMITS.concentrationMillionPerMl).toBe(16);
    expect(WHO_6TH_LOWER_LIMITS.vitalityPct).toBe(54);
  });

  it("honours clinic-specific reference limits when supplied", () => {
    const strict: ReferenceLimits = { ...WHO_6TH_LOWER_LIMITS, concentrationMillionPerMl: 20 };
    expect(flagSemen({ ...atLimit, concentrationMillionPerMl: 18 }, strict).concentration).toBe("below_reference");
  });
});

describe("validateSemenParameters", () => {
  it("accepts a valid sample", () => {
    expect(validateSemenParameters(atLimit).ok).toBe(true);
  });

  it("rejects a negative value and a non-finite value", () => {
    const neg = validateSemenParameters({ ...atLimit, volumeMl: -1 });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.error.detailKey).toBe("andrology.semen.bad_value");
    const inf = validateSemenParameters({ ...atLimit, totalCountMillion: Number.POSITIVE_INFINITY });
    expect(inf.ok).toBe(false);
    if (!inf.ok) expect(inf.error.detailKey).toBe("andrology.semen.bad_value");
  });

  it("rejects a percentage above 100", () => {
    const bad = validateSemenParameters({ ...atLimit, progressiveMotilityPct: 150 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("andrology.semen.bad_percentage");
  });
});
