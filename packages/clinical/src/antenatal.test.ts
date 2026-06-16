import { describe, expect, it } from "vitest";
import { estimateEdd, gestationWeeks, plannedVisits, assessVisit, DEFAULT_VISIT_SCHEDULE_WEEKS } from "./antenatal.js";

describe("antenatal dating (pure)", () => {
  it("estimates EDD as LMP + 280 days (Naegele)", () => {
    expect(estimateEdd("2026-01-01")).toBe("2026-10-08"); // 2026-01-01 + 280d
  });
  it("computes whole gestational weeks, clamping pre-LMP to 0", () => {
    expect(gestationWeeks("2026-01-01", "2026-01-01")).toBe(0);
    expect(gestationWeeks("2026-01-01", "2026-01-15")).toBe(2);
    expect(gestationWeeks("2026-01-01", "2025-12-25")).toBe(0); // before LMP
  });
  it("plans visits from LMP for the default + a custom schedule", () => {
    const def = plannedVisits("2026-01-01");
    expect(def).toHaveLength(DEFAULT_VISIT_SCHEDULE_WEEKS.length);
    expect(def[0]).toEqual({ week: 8, dueAt: "2026-02-26" }); // +56d
    const custom = plannedVisits("2026-01-01", [10]);
    expect(custom).toEqual([{ week: 10, dueAt: "2026-03-12" }]);
  });
});

describe("antenatal visit risk flagging (pure)", () => {
  const base = { gestationWeeks: 28, bpSystolic: 120, bpDiastolic: 80 };
  it("flags nothing for a normal visit", () => {
    expect(assessVisit(base)).toEqual([]);
  });
  it("flags hypertension via systolic OR diastolic", () => {
    expect(assessVisit({ ...base, bpSystolic: 145 })).toContain("hypertension");
    expect(assessVisit({ ...base, bpDiastolic: 95 })).toContain("hypertension");
  });
  it("flags proteinuria, and pre-eclampsia risk when hypertensive + proteinuria ≥20w", () => {
    expect(assessVisit({ ...base, proteinuria: true })).toEqual(["proteinuria"]);
    expect(assessVisit({ ...base, bpSystolic: 150, proteinuria: true })).toEqual(["hypertension", "proteinuria", "pre_eclampsia_risk"]);
    // hypertensive + proteinuria but <20 weeks → no pre-eclampsia flag
    expect(assessVisit({ gestationWeeks: 18, bpSystolic: 150, bpDiastolic: 80, proteinuria: true })).toEqual(["hypertension", "proteinuria"]);
  });
  it("flags fundal-height discrepancy only ≥24w with a measurement >3cm off", () => {
    expect(assessVisit({ ...base, fundalHeightCm: 30 })).toEqual([]); // 2cm off 28 → within range
    expect(assessVisit({ ...base, fundalHeightCm: 33.5 })).toContain("fundal_height_discrepancy"); // 5.5 off
    expect(assessVisit({ gestationWeeks: 20, bpSystolic: 120, bpDiastolic: 80, fundalHeightCm: 10 })).toEqual([]); // <24w, skipped
    expect(assessVisit({ ...base, fundalHeightCm: null })).toEqual([]); // no measurement
  });
});
