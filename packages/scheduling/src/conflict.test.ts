import { describe, expect, it } from "vitest";
import { intervalsOverlap, findConflicts } from "./conflict.js";
import { asId } from "@oxford/core";
import type { Appointment } from "./types.js";

const r = (s: string) => asId<"Resource">(s);
const appt = (id: string, resourceIds: string[], start: string, end: string): Appointment => ({
  id: asId<"Appointment">(id), typeId: asId<"AppointmentType">("t"), patientId: "p",
  practitionerId: r("doc"), resourceIds: resourceIds.map(r), start, end, status: "booked",
});

describe("intervalsOverlap (half-open)", () => {
  it("overlaps when they intersect", () => {
    expect(intervalsOverlap("2026-06-13T09:00:00Z", "2026-06-13T10:00:00Z", "2026-06-13T09:30:00Z", "2026-06-13T10:30:00Z")).toBe(true);
  });
  it("does not overlap when touching at the boundary", () => {
    expect(intervalsOverlap("2026-06-13T09:00:00Z", "2026-06-13T10:00:00Z", "2026-06-13T10:00:00Z", "2026-06-13T11:00:00Z")).toBe(false);
  });
  it("does not overlap when disjoint", () => {
    expect(intervalsOverlap("2026-06-13T09:00:00Z", "2026-06-13T10:00:00Z", "2026-06-13T11:00:00Z", "2026-06-13T12:00:00Z")).toBe(false);
  });
});

describe("findConflicts", () => {
  const existing = [appt("a", ["scanner-1"], "2026-06-13T09:00:00Z", "2026-06-13T10:00:00Z")];
  it("flags a shared resource overlapping in time", () => {
    expect(findConflicts(existing, { resourceIds: [r("scanner-1")], start: "2026-06-13T09:30:00Z", end: "2026-06-13T10:30:00Z" })).toHaveLength(1);
  });
  it("ignores a different resource", () => {
    expect(findConflicts(existing, { resourceIds: [r("scanner-2")], start: "2026-06-13T09:30:00Z", end: "2026-06-13T10:30:00Z" })).toHaveLength(0);
  });
  it("ignores the excluded appointment (reschedule itself)", () => {
    expect(findConflicts(existing, { resourceIds: [r("scanner-1")], start: "2026-06-13T09:30:00Z", end: "2026-06-13T10:30:00Z", excludeId: "a" })).toHaveLength(0);
  });
  it("ignores a non-overlapping time on the same resource", () => {
    expect(findConflicts(existing, { resourceIds: [r("scanner-1")], start: "2026-06-13T11:00:00Z", end: "2026-06-13T12:00:00Z" })).toHaveLength(0);
  });
});
