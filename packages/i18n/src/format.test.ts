import { describe, expect, it } from "vitest";
import { bilingualCalendarDate, formatGregorian, formatHijri, formatNumber } from "./format.js";

const date = new Date("2026-06-12T12:00:00.000Z");

describe("format", () => {
  it("formats numbers in en-GB conventions", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
  });

  it("formats numbers for Arabic without throwing", () => {
    expect(formatNumber(1234.5, "ar")).not.toBe("");
  });

  it("renders a Gregorian long date", () => {
    expect(formatGregorian(date, "en")).toMatch(/2026/);
  });

  it("renders a Hijri date that differs from the Gregorian one", () => {
    const greg = formatGregorian(date, "en");
    const hijri = formatHijri(date, "en");
    expect(hijri).not.toBe("");
    expect(hijri).not.toBe(greg);
  });

  it("returns both calendars together", () => {
    const both = bilingualCalendarDate(date, "ar");
    expect(both.gregorian).not.toBe("");
    expect(both.hijri).not.toBe("");
  });
});
