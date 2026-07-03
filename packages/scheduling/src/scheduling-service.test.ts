import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { SchedulingService } from "./scheduling-service.js";
import { InMemorySchedulingStore } from "./store.js";
import type { AppointmentId } from "./types.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new SchedulingService(new InMemorySchedulingStore(), audit, events), audit, events };
}

const N = (en: string) => ({ ar: en, en });

async function setup() {
  const ctx = build();
  const doc = await ctx.svc.addResource("practitioner", N("Dr A"));
  const scanner = await ctx.svc.addResource("scanner", N("Scanner 1"), { level: "L3", locationRef: "loc-scan-1" });
  const type = await ctx.svc.addAppointmentType(N("Monitoring scan"), 30, ["practitioner", "scanner"]);
  return { ...ctx, doc, scanner, type };
}

describe("SchedulingService.book", () => {
  it("books a slot, audits, emits AppointmentBooked", async () => {
    const { svc, doc, scanner, type, audit, events } = await setup();
    const r = await svc.book("rec-1", { typeId: type.id, patientId: "pat-1", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("booked");
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("AppointmentBooked");
  });

  it("rejects a conflicting slot on a shared resource", async () => {
    const { svc, doc, scanner, type } = await setup();
    const first = await svc.book("rec-1", { typeId: type.id, patientId: "pat-1", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    expect(first.ok).toBe(true);
    const clash = await svc.book("rec-1", { typeId: type.id, patientId: "pat-2", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:15:00Z", end: "2026-06-15T09:45:00Z" });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error.detailKey).toBe("scheduling.conflict");
  });

  it("rejects a bad interval and an unparseable date", async () => {
    const { svc, doc, type } = await setup();
    const bad = await svc.book("rec-1", { typeId: type.id, patientId: "p", practitionerId: doc.id, resourceIds: [], start: "2026-06-15T10:00:00Z", end: "2026-06-15T09:00:00Z" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("scheduling.bad_interval");
    const nope = await svc.book("rec-1", { typeId: type.id, patientId: "p", practitionerId: doc.id, resourceIds: [], start: "not-a-date", end: "2026-06-15T09:00:00Z" });
    expect(nope.ok).toBe(false);
    if (!nope.ok) expect(nope.error.detailKey).toBe("scheduling.bad_date");
  });
});

describe("SchedulingService.appointmentsForPatient", () => {
  it("returns only the given patient's appointments (portal read)", async () => {
    const { svc, doc, scanner, type } = await setup();
    await svc.book("rec-1", { typeId: type.id, patientId: "pat-1", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    await svc.book("rec-1", { typeId: type.id, patientId: "pat-2", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T10:00:00Z", end: "2026-06-15T10:30:00Z" });
    const mine = await svc.appointmentsForPatient("pat-1");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.patientId).toBe("pat-1");
    expect(await svc.appointmentsForPatient("nobody")).toHaveLength(0);
  });
});

describe("SchedulingService lifecycle", () => {
  async function booked() {
    const ctx = await setup();
    const r = await ctx.svc.book("rec-1", { typeId: ctx.type.id, patientId: "pat-1", practitionerId: ctx.doc.id, resourceIds: [ctx.scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    if (!r.ok) throw new Error("setup");
    return { ...ctx, appt: r.value };
  }

  it("check-in → start → complete", async () => {
    const ctx = await booked();
    expect((await ctx.svc.checkIn("rec-1", ctx.appt.id)).ok).toBe(true);
    expect((await ctx.svc.start("doc-1", ctx.appt.id)).ok).toBe(true);
    expect((await ctx.svc.complete("doc-1", ctx.appt.id)).ok).toBe(true);
  });

  it("cancel records a reason; no-show is captured", async () => {
    const ctx = await booked();
    const c = await ctx.svc.cancel("rec-1", ctx.appt.id, "patient requested");
    expect(c.ok && c.value.cancellationReason).toBe("patient requested");
    const ctx2 = await booked();
    const n = await ctx2.svc.markNoShow("rec-1", ctx2.appt.id);
    expect(n.ok && n.value.status).toBe("no_show");
  });

  it("rejects an illegal transition and a missing appointment", async () => {
    const ctx = await booked();
    const bad = await ctx.svc.complete("doc-1", ctx.appt.id); // booked→completed illegal
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("scheduling.bad_transition");
    const missing = await ctx.svc.checkIn("rec-1", asId<"Appointment">("ghost") as AppointmentId);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND");
  });

  it("lists appointments", async () => {
    const ctx = await booked();
    expect(await ctx.svc.list()).toHaveLength(1);
  });

  it("appointmentsOn returns the day's active bookings, excluding other days + cancelled/no-show", async () => {
    const ctx = await setup();
    const day = "2026-06-15";
    const a = await ctx.svc.book("rec-1", { typeId: ctx.type.id, patientId: "pat-1", practitionerId: ctx.doc.id, resourceIds: [ctx.scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    await ctx.svc.book("rec-1", { typeId: ctx.type.id, patientId: "pat-2", practitionerId: ctx.doc.id, resourceIds: [ctx.scanner.id], start: "2026-06-16T09:00:00Z", end: "2026-06-16T09:30:00Z" }); // next day
    const cancelled = await ctx.svc.book("rec-1", { typeId: ctx.type.id, patientId: "pat-3", practitionerId: ctx.doc.id, resourceIds: [], start: "2026-06-15T11:00:00Z", end: "2026-06-15T11:30:00Z" });
    if (cancelled.ok) await ctx.svc.cancel("rec-1", cancelled.value.id, "patient requested");

    const onDay = await ctx.svc.appointmentsOn(day);
    expect(onDay.map((x) => x.patientId)).toEqual(["pat-1"]);
    // a checked-in appointment is still "on the day"
    if (a.ok) await ctx.svc.checkIn("rec-1", a.value.id);
    expect((await ctx.svc.appointmentsOn(day)).map((x) => x.patientId)).toEqual(["pat-1"]);
    expect(await ctx.svc.appointmentsOn("2026-06-17")).toHaveLength(0);
  });
});
