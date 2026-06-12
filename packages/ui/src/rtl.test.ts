import { describe, expect, it } from "vitest";
import { htmlDirAttributes, inlineStart, inlineEnd, rendersLtrInRtl } from "./rtl.js";
import { palette, spacing, typography, drugClassColor } from "./tokens.js";

describe("htmlDirAttributes", () => {
  it("flips to RTL for Arabic and LTR for English", () => {
    expect(htmlDirAttributes("ar")).toEqual({ dir: "rtl", lang: "ar" });
    expect(htmlDirAttributes("en")).toEqual({ dir: "ltr", lang: "en" });
  });
});

describe("logical-to-physical side mapping", () => {
  it("maps inline-start", () => {
    expect(inlineStart("ltr")).toBe("left");
    expect(inlineStart("rtl")).toBe("right");
  });
  it("maps inline-end", () => {
    expect(inlineEnd("ltr")).toBe("right");
    expect(inlineEnd("rtl")).toBe("left");
  });
});

describe("tokens (canonical om-software palette)", () => {
  it("exposes the warm-neutral canvas + teal accent + fonts", () => {
    expect(palette.bg).toBe("#F5F5F0");
    expect(palette.accent).toBe("#2A7C6F");
    expect(typography.display).toContain("Satoshi");
    expect(typography.body).toContain("Plus Jakarta Sans");
    expect(typography.arabic).toContain("Noto Sans Arabic");
    expect(spacing.sm).toBe(8);
    expect(drugClassColor.trigger).toBe("#DC2626"); // time-critical red, fixed
  });
});

describe("clinical LTR exception (PALETTE §11)", () => {
  it("keeps drug names, lab values and embryo grades LTR even in RTL", () => {
    expect(rendersLtrInRtl("drug_name")).toBe(true);
    expect(rendersLtrInRtl("lab_value")).toBe(true);
    expect(rendersLtrInRtl("embryo_grade")).toBe(true);
  });
});
