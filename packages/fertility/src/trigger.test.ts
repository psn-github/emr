import { describe, expect, it } from "vitest";
import { computeRetrievalTime, countdownHours, DEFAULT_TRIGGER_TO_RETRIEVAL_HOURS } from "./trigger.js";

describe("trigger calculator", () => {
  it("schedules retrieval the default 36h after trigger", () => {
    const r = computeRetrievalTime("2026-06-20T21:00:00.000Z");
    expect(r.ok && r.value).toBe("2026-06-22T09:00:00.000Z");
    expect(DEFAULT_TRIGGER_TO_RETRIEVAL_HOURS).toBe(36);
  });
  it("honours a custom lead interval", () => {
    const r = computeRetrievalTime("2026-06-20T21:00:00.000Z", 35);
    expect(r.ok && r.value).toBe("2026-06-22T08:00:00.000Z");
  });
  it("rejects a bad trigger time or non-positive lead", () => {
    const badTime = computeRetrievalTime("nope");
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.error.detailKey).toBe("fertility.trigger.bad_time");
    const badLead = computeRetrievalTime("2026-06-20T21:00:00Z", 0);
    expect(badLead.ok).toBe(false);
    if (!badLead.ok) expect(badLead.error.detailKey).toBe("fertility.trigger.bad_lead");
  });
  it("counts down hours to a target (negative once elapsed)", () => {
    expect(countdownHours(new Date("2026-06-22T07:00:00Z"), "2026-06-22T09:00:00.000Z")).toBe(2);
    expect(countdownHours(new Date("2026-06-22T10:00:00Z"), "2026-06-22T09:00:00.000Z")).toBe(-1);
  });
});
