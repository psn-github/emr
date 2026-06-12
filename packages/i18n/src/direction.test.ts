import { describe, expect, it } from "vitest";
import { directionFor, isRtl } from "./direction.js";
import { isLocale } from "./types.js";

describe("direction", () => {
  it("is ltr for English and rtl for Arabic", () => {
    expect(directionFor("en")).toBe("ltr");
    expect(directionFor("ar")).toBe("rtl");
  });

  it("isRtl is true only for Arabic", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });
});

describe("isLocale", () => {
  it("recognises supported locales", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
