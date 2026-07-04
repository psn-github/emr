import { describe, expect, it } from "vitest";
import { DEFAULT_MRN_FORMAT, formatMrn, isWellFormedMrn, isImportableMrn, type MrnFormat } from "./mrn.js";

describe("MRN format (pure)", () => {
  it("formats with the default OM-<year>-<5-digit seq> scheme", () => {
    expect(formatMrn(DEFAULT_MRN_FORMAT, 2026, 42)).toBe("OM-2026-00042");
    expect(formatMrn(DEFAULT_MRN_FORMAT, 2026, 1)).toBe("OM-2026-00001");
    expect(formatMrn(DEFAULT_MRN_FORMAT, 2027, 123456)).toBe("OM-2027-123456"); // overflow keeps digits
  });

  it("supports a custom configured format", () => {
    const fmt: MrnFormat = { prefix: "OXK", seqWidth: 4 };
    expect(formatMrn(fmt, 2026, 7)).toBe("OXK-2026-0007");
    expect(isWellFormedMrn(fmt, "OXK-2026-0007")).toBe(true);
    expect(isWellFormedMrn(fmt, "OM-2026-00007")).toBe(false);
  });

  it("validates well-formed allocated MRNs (prefix regex is escaped)", () => {
    expect(isWellFormedMrn(DEFAULT_MRN_FORMAT, "OM-2026-00042")).toBe(true);
    expect(isWellFormedMrn(DEFAULT_MRN_FORMAT, "OM-2026-042")).toBe(false); // too few digits
    expect(isWellFormedMrn(DEFAULT_MRN_FORMAT, "XX-2026-00042")).toBe(false);
    expect(isWellFormedMrn({ prefix: "O.M", seqWidth: 5 }, "OXM-2026-00042")).toBe(false); // '.' is literal
  });

  it("accepts importable legacy numbers (non-empty, untrimmed-blank-free)", () => {
    expect(isImportableMrn("12345")).toBe(true);
    expect(isImportableMrn("CLINIKO-9987")).toBe(true);
    expect(isImportableMrn("")).toBe(false);
    expect(isImportableMrn(" 123 ")).toBe(false);
  });
});
