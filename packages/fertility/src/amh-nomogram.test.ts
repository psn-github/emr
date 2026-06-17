import { describe, expect, it } from "vitest";
import { amhNomogram } from "./amh-nomogram.js";

describe("AMH nomogram (pure, advisory)", () => {
  it("categorises by AMH band with an expected oocyte range", () => {
    expect(amhNomogram(0.5, 32).category).toBe("poor");
    expect(amhNomogram(1.0, 32).category).toBe("reduced");
    expect(amhNomogram(2.2, 32).category).toBe("normal");
    expect(amhNomogram(5.0, 32)).toMatchObject({ category: "high", expectedOocyteRange: { min: 15, max: 25 } });
  });

  it("flags OHSS precaution for high responders and low-prognosis for poor", () => {
    expect(amhNomogram(6.0, 30).counsellingFlags).toContain("ohss_precaution");
    expect(amhNomogram(0.4, 30).counsellingFlags).toContain("low_prognosis_counselling");
    // a normal responder under 40 carries no flags
    expect(amhNomogram(2.5, 34).counsellingFlags).toEqual([]);
  });

  it("adds advanced-maternal-age counselling at ≥40 (independent of AMH band)", () => {
    expect(amhNomogram(2.5, 41).counsellingFlags).toEqual(["advanced_maternal_age_counselling"]);
    expect(amhNomogram(6.0, 42).counsellingFlags).toEqual(["ohss_precaution", "advanced_maternal_age_counselling"]);
  });
});
