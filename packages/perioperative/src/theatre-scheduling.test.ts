import { describe, expect, it } from "vitest";
import { fixedClock, ok, err, conflict, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { bedReservationStatus } from "./bed-reservation.js";
import { TheatreSchedulingService } from "./theatre-scheduling-service.js";
import { InMemoryTheatreCaseStore } from "./theatre-store.js";
import type { SchedulingPort, BookTheatreSlotInput } from "./ports.js";

describe("bedReservationStatus (pure)", () => {
  it("flags only when the day's list exceeds the L2 bed count", () => {
    expect(bedReservationStatus(6, 6)).toEqual({ reserved: 6, capacity: 6, exceedsBeds: false });
    expect(bedReservationStatus(7, 6)).toEqual({ reserved: 7, capacity: 6, exceedsBeds: true });
  });
});

class FakeScheduling implements SchedulingPort {
  ok = true;
  n = 0;
  readonly booked: BookTheatreSlotInput[] = [];
  async bookTheatreSlot(_a: string, input: BookTheatreSlotInput): Promise<Result<{ appointmentId: string }, AppError>> {
    if (!this.ok) return err(conflict("the slot conflicts with an existing booking", "scheduling.conflict"));
    this.booked.push(input);
    return ok({ appointmentId: `appt-${++this.n}` });
  }
}

function build(l2 = 6) {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const scheduling = new FakeScheduling();
  return { svc: new TheatreSchedulingService(new InMemoryTheatreCaseStore(), scheduling, audit, events, l2), scheduling, events };
}

const caseInput = (over: Record<string, unknown> = {}) => ({
  typeId: "type-1",
  patientId: "pat-1",
  procedure: "oocyte retrieval",
  theatreResourceId: "theatre-1",
  surgeonResourceId: "surgeon-1",
  scheduledDate: "2026-06-25",
  start: "2026-06-25T09:00:00Z",
  end: "2026-06-25T10:00:00Z",
  ...over,
});

describe("TheatreSchedulingService", () => {
  it("schedules a case via the shared calendar (conflict-aware) with a bed reservation", async () => {
    const { svc, scheduling, events } = build();
    const r = await svc.scheduleCase("coord-1", caseInput({ supportResourceIds: ["nurse-1"], equipment: ["laparoscope"] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.theatreCase.appointmentRef).toBe("appt-1");
      expect(r.value.bedReservation.exceedsBeds).toBe(false);
    }
    expect(scheduling.booked[0]!.resourceIds).toEqual(["theatre-1", "nurse-1"]);
    expect((await events.events())[0]!.payload.type).toBe("TheatreCaseScheduled");
  });

  it("rejects a case that conflicts on the shared resource calendar", async () => {
    const { svc, scheduling } = build();
    scheduling.ok = false;
    const r = await svc.scheduleCase("coord-1", caseInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("scheduling.conflict");
  });

  it("flags the day when the list would exceed the 6 L2 beds, and emits a warning", async () => {
    const { svc, events } = build(6);
    let last;
    for (let i = 0; i < 7; i++) {
      last = await svc.scheduleCase("coord-1", caseInput({ patientId: `pat-${i}`, start: `2026-06-25T${9 + i}:00:00Z`, end: `2026-06-25T${10 + i}:00:00Z` }));
    }
    expect(last!.ok && last!.value.bedReservation).toMatchObject({ reserved: 7, capacity: 6, exceedsBeds: true });
    expect((await events.events()).some((e) => e.payload.type === "TheatreListExceedsBeds")).toBe(true);
    const day = await svc.dayList("2026-06-25");
    expect(day.cases).toHaveLength(7);
    expect(day.bedReservation.exceedsBeds).toBe(true);
  });

  it("computes per-theatre utilisation for a day (only that theatre's cases)", async () => {
    const { svc } = build();
    await svc.scheduleCase("coord-1", caseInput({ patientId: "p1", start: "2026-06-25T09:00:00Z", end: "2026-06-25T10:00:00Z" }));
    await svc.scheduleCase("coord-1", caseInput({ patientId: "p2", start: "2026-06-25T10:30:00Z", end: "2026-06-25T11:30:00Z" }));
    // a case in a different theatre is excluded
    await svc.scheduleCase("coord-1", caseInput({ patientId: "p3", theatreResourceId: "theatre-2", start: "2026-06-25T09:00:00Z", end: "2026-06-25T12:00:00Z" }));
    const u = await svc.utilisation("theatre-1", "2026-06-25", 480);
    expect(u.caseCount).toBe(2);
    expect(u.bookedMinutes).toBe(120);
    expect(u.turnaroundMinutes).toBe(30);
  });

  it("cancels a case (and rejects a missing one)", async () => {
    const { svc } = build();
    const r = await svc.scheduleCase("coord-1", caseInput());
    if (!r.ok) return;
    const c = await svc.cancelCase("coord-1", r.value.theatreCase.id, "patient deferred");
    expect(c.ok && c.value.status).toBe("cancelled");
    // cancelled cases drop out of the day list
    expect((await svc.dayList("2026-06-25")).cases).toHaveLength(0);
    const missing = await svc.cancelCase("coord-1", "nope" as never, "x");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("perioperative.case.not_found");
  });
});
