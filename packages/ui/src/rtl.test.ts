import { describe, expect, it } from "vitest";
import { htmlDirAttributes, inlineStart, inlineEnd } from "./rtl.js";
import { palette, spacing, typography } from "./tokens.js";

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

describe("tokens", () => {
  it("exposes the stable token contract", () => {
    expect(palette.oxfordBlue).toMatch(/^#/);
    expect(typography.serif).toContain("Cormorant");
    expect(spacing[0]).toBe(0);
  });
});
