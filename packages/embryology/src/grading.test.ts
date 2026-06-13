import { describe, expect, it } from "vitest";
import { makeGardnerGrade, parseGardnerGrade, formatGardnerGrade } from "./grading.js";

describe("Gardner grading", () => {
  it("accepts a valid grade", () => {
    const g = makeGardnerGrade(4, "A", "B");
    expect(g.ok && g.value).toEqual({ expansion: 4, icm: "A", te: "B" });
  });

  it("rejects an out-of-range or non-integer expansion", () => {
    expect(makeGardnerGrade(0, "A", "A").ok).toBe(false);
    expect(makeGardnerGrade(7, "A", "A").ok).toBe(false);
    const frac = makeGardnerGrade(4.5, "A", "A");
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.error.detailKey).toBe("embryology.grade.bad_expansion");
  });

  it("rejects a bad ICM or trophectoderm letter", () => {
    const icm = makeGardnerGrade(4, "D", "A");
    expect(icm.ok).toBe(false);
    if (!icm.ok) expect(icm.error.detailKey).toBe("embryology.grade.bad_icm");
    const te = makeGardnerGrade(4, "A", "Z");
    expect(te.ok).toBe(false);
    if (!te.ok) expect(te.error.detailKey).toBe("embryology.grade.bad_te");
  });

  it("parses and formats a grade string round-trip", () => {
    const g = parseGardnerGrade("5AB");
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.value).toEqual({ expansion: 5, icm: "A", te: "B" });
      expect(formatGardnerGrade(g.value)).toBe("5AB");
    }
  });

  it("rejects a malformed grade string", () => {
    const g = parseGardnerGrade("blast");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.error.detailKey).toBe("embryology.grade.bad_format");
  });
});
