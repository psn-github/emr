import { describe, expect, it } from "vitest";
import { classifyBetaHcg, isClinicalPregnancy, deriveKpiInputs, DEFAULT_BETA_HCG_POSITIVE_THRESHOLD } from "./outcome-logic.js";
import type { CycleOutcomeSummary, PregnancyTest, ClinicalAssessment, PregnancyOutcome } from "./types.js";
import { asId } from "@oxford/core";

describe("β-hCG classification", () => {
  it("is positive at or above the threshold, negative below", () => {
    expect(classifyBetaHcg(DEFAULT_BETA_HCG_POSITIVE_THRESHOLD)).toEqual({ ok: true, value: "positive" });
    expect(classifyBetaHcg(DEFAULT_BETA_HCG_POSITIVE_THRESHOLD - 1)).toEqual({ ok: true, value: "negative" });
  });
  it("honours a custom threshold", () => {
    expect(classifyBetaHcg(50, 100)).toEqual({ ok: true, value: "negative" });
  });
  it("rejects a negative or non-finite value", () => {
    expect(classifyBetaHcg(-1).ok).toBe(false);
    const nan = classifyBetaHcg(Number.NaN);
    expect(nan.ok).toBe(false);
    if (!nan.ok) expect(nan.error.detailKey).toBe("outcomes.beta_hcg.bad_value");
  });
});

describe("clinical pregnancy", () => {
  it("requires at least one gestational sac", () => {
    expect(isClinicalPregnancy(0)).toBe(false);
    expect(isClinicalPregnancy(1)).toBe(true);
  });
});

const test = (result: "positive" | "negative"): PregnancyTest => ({ id: asId<"PregnancyTest">("t"), cycleId: "c", betaHcgMiuMl: 100, result, testedAt: "x", recordedBy: "u" });
const assess = (clinicalPregnancy: boolean): ClinicalAssessment => ({ id: asId<"ClinicalAssessment">("a"), cycleId: "c", gestationalSacs: 1, fetalHeartbeats: 1, clinicalPregnancy, assessedAt: "x", recordedBy: "u" });
const outcome = (type: PregnancyOutcome["type"]): PregnancyOutcome => ({ id: asId<"PregnancyOutcome">("o"), cycleId: "c", type, liveBirthCount: type === "live_birth" ? 1 : 0, gestationalAgeWeeks: null, occurredAt: "x", note: null, recordedBy: "u" });

describe("deriveKpiInputs", () => {
  it("is all-false for an empty continuum", () => {
    const empty: CycleOutcomeSummary = { cycleId: "c", test: null, clinicalAssessment: null, outcome: null };
    expect(deriveKpiInputs(empty)).toEqual({ biochemicalPregnancy: false, clinicalPregnancy: false, liveBirth: false, ongoing: false });
  });
  it("reflects a positive test, clinical pregnancy and a live birth", () => {
    const s: CycleOutcomeSummary = { cycleId: "c", test: test("positive"), clinicalAssessment: assess(true), outcome: outcome("live_birth") };
    expect(deriveKpiInputs(s)).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, ongoing: false });
  });
  it("flags an ongoing pregnancy", () => {
    const s: CycleOutcomeSummary = { cycleId: "c", test: test("positive"), clinicalAssessment: assess(false), outcome: outcome("ongoing") };
    expect(deriveKpiInputs(s)).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: false, liveBirth: false, ongoing: true });
  });
});
