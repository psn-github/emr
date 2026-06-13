import { describe, expect, it } from "vitest";
import { theatreUtilisation } from "./analytics.js";

describe("theatreUtilisation (pure)", () => {
  it("computes booked minutes, utilisation %, and turnaround gaps", () => {
    const cases = [
      { start: "2026-06-25T09:00:00Z", end: "2026-06-25T10:00:00Z" }, // 60 min
      { start: "2026-06-25T10:30:00Z", end: "2026-06-25T11:30:00Z" }, // 60 min, 30 min gap
    ];
    const u = theatreUtilisation(cases, 480); // 8h session
    expect(u.caseCount).toBe(2);
    expect(u.bookedMinutes).toBe(120);
    expect(u.turnaroundMinutes).toBe(30);
    expect(u.utilisationPct).toBe(25); // 120/480
  });

  it("sorts unordered cases and ignores negative/overlap gaps", () => {
    const cases = [
      { start: "2026-06-25T11:00:00Z", end: "2026-06-25T12:00:00Z" },
      { start: "2026-06-25T09:00:00Z", end: "2026-06-25T11:30:00Z" }, // overlaps next start → gap clamped to 0
    ];
    const u = theatreUtilisation(cases, 480);
    expect(u.bookedMinutes).toBe(210);
    expect(u.turnaroundMinutes).toBe(0);
  });

  it("returns 0% utilisation when no session time is available, and handles an empty list", () => {
    expect(theatreUtilisation([{ start: "2026-06-25T09:00:00Z", end: "2026-06-25T10:00:00Z" }], 0).utilisationPct).toBe(0);
    const empty = theatreUtilisation([], 480);
    expect(empty).toMatchObject({ caseCount: 0, bookedMinutes: 0, turnaroundMinutes: 0, utilisationPct: 0 });
  });
});
