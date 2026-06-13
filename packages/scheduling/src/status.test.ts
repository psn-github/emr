import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./status.js";

describe("appointment status transitions", () => {
  it("allows the normal flow + no-show + cancel", () => {
    expect(canTransition("booked", "checked_in")).toBe(true);
    expect(canTransition("checked_in", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("booked", "no_show")).toBe(true);
    expect(canTransition("booked", "cancelled")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransition("booked", "completed")).toBe(false);
    expect(canTransition("completed", "booked")).toBe(false);
    expect(canTransition("cancelled", "checked_in")).toBe(false);
  });
  it("assertTransition surfaces the i18n key on illegal moves", () => {
    expect(assertTransition("booked", "checked_in").ok).toBe(true);
    const bad = assertTransition("booked", "completed");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("scheduling.bad_transition");
  });
});
