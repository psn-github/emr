import { describe, expect, it } from "vitest";
import { computeIntervals, validateEventOrder, assessMorphokinetics, InMemoryMorphokineticRangeStore, MORPHOKINETIC_RANGES } from "./morphokinetics.js";

describe("morphokinetics — derived intervals (pure)", () => {
  it("computes cc2/s2/cc3/t5_t2 only when both endpoints are present", () => {
    expect(computeIntervals({ t2: 26, t3: 37, t4: 40, t5: 50 })).toEqual({ cc2: 11, s2: 3, cc3: 13, t5_t2: 24 });
    expect(computeIntervals({})).toEqual({});
    expect(computeIntervals({ t2: 26 })).toEqual({}); // no partner events
  });
});

describe("morphokinetics — timing validation (pure)", () => {
  it("accepts ordered positive timings (and an empty set)", () => {
    expect(validateEventOrder({ t2: 26, t3: 37, t5: 50 })).toBeNull();
    expect(validateEventOrder({})).toBeNull();
  });
  it("rejects non-positive and out-of-order timings", () => {
    expect(validateEventOrder({ t2: 0 })).toBe("non_positive");
    expect(validateEventOrder({ t2: 30, t3: 28 })).toBe("out_of_order");
  });
});

describe("morphokinetics — assessment (pure)", () => {
  it("scores every monitored variable within its optimal range", () => {
    const a = assessMorphokinetics({ t2: 26, t3: 37, t4: 40, t5: 50 });
    expect(a.monitored).toBe(6); // t2,t3,t5 (events) + cc2,s2,t5_t2 (intervals)
    expect(a.score).toBe(6);
    expect(a.inRange.cc2).toBe(true);
    expect(a.flags).toEqual([]);
  });
  it("marks out-of-range variables and flags direct cleavage (cc2 < 5h)", () => {
    const a = assessMorphokinetics({ t2: 24, t3: 27 }); // cc2 = 3 → direct cleavage; t3 too early
    expect(a.flags).toContain("direct_cleavage");
    expect(a.inRange.t2).toBe(true);
    expect(a.inRange.t3).toBe(false);
    expect(a.inRange.cc2).toBe(false);
    expect(a.score).toBe(1);
    expect(a.monitored).toBe(3);
  });
  it("skips unmeasured variables", () => {
    const a = assessMorphokinetics({ t2: 26 });
    expect(a.monitored).toBe(1);
    expect(a.score).toBe(1);
    expect(a.inRange.t5).toBeUndefined();
  });
});

describe("morphokinetics — range config store", () => {
  it("lists the seeded ranges by default and a custom set when provided", async () => {
    expect(await new InMemoryMorphokineticRangeStore().list()).toEqual(MORPHOKINETIC_RANGES);
    const custom = new InMemoryMorphokineticRangeStore([{ code: "t2", name: { ar: "a", en: "t2" }, optimalMin: 20, optimalMax: 30 }]);
    expect((await custom.list()).map((r) => r.code)).toEqual(["t2"]);
  });
});
