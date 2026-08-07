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

describe("SchedulingService reads (appointment / resource / type)", () => {
  it("reads an appointment, resource and type by id; null for unknown ids", async () => {
    const ctx = await setup();
    const booked = await ctx.svc.book("staff-1", { typeId: ctx.type.id, patientId: "pat-1", practitionerId: ctx.doc.id, resourceIds: [ctx.scanner.id], start: "2026-06-13T09:00:00.000Z", end: "2026-06-13T09:30:00.000Z" });
    if (!booked.ok) throw new Error("setup");
    expect((await ctx.svc.appointment(booked.value.id))?.patientId).toBe("pat-1");
    expect((await ctx.svc.resource(ctx.doc.id))?.name.en).toBe("Dr A");
    expect((await ctx.svc.appointmentType(ctx.type.id))?.name.en).toBe("Monitoring scan");
    expect(await ctx.svc.appointment(asId<"Appointment">("ghost"))).toBeNull();
    expect(await ctx.svc.resource(asId<"Resource">("ghost"))).toBeNull();
    expect(await ctx.svc.appointmentType(asId<"AppointmentType">("ghost"))).toBeNull();
  });
});

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

describe("SchedulingService config surface (defineResource / defineAppointmentType)", () => {
  it("defines a resource + appointment type with STABLE ids, audits CREATE then UPDATE, and lists them", async () => {
    const { svc, audit, events } = build();

    const created = await svc.defineResource("ops-1", { id: "res-scanner-1", kind: "scanner", name: N("Ultrasound 1"), level: "L3", locationRef: "loc-scan-1" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.id).toBe("res-scanner-1");
    expect(created.value.locationRef).toBe("loc-scan-1");

    const type = await svc.defineAppointmentType("ops-1", {
      id: "type-monitoring",
      name: N("Monitoring scan"),
      durationMin: 30,
      requiredResourceKinds: ["practitioner", "scanner"],
      prep: N("Attend with a full bladder"),
      defaultBillingItem: "SCAN",
    });
    expect(type.ok && type.value.prep?.en).toBe("Attend with a full bladder");

    // config reads (the booking UI's lists)
    expect((await svc.resources()).map((r) => r.id)).toEqual(["res-scanner-1"]);
    expect((await svc.appointmentTypes()).map((t) => t.id)).toEqual(["type-monitoring"]);

    // re-applying the SAME stable ids is an idempotent upsert (no duplicates),
    // audited as an UPDATE rather than a CREATE
    const again = await svc.defineAppointmentType("ops-1", { id: "type-monitoring", name: N("Monitoring scan"), durationMin: 20, requiredResourceKinds: ["practitioner"] });
    expect(again.ok && again.value.durationMin).toBe(20);
    expect(await svc.appointmentTypes()).toHaveLength(1);

    const actions = (await audit.entries()).map((e) => `${e.payload.entityType}:${e.payload.action}`);
    expect(actions).toEqual(["Resource:CREATE", "AppointmentType:CREATE", "AppointmentType:UPDATE"]);
    expect((await events.events()).map((e) => e.payload.type)).toEqual(["ResourceDefined", "AppointmentTypeDefined", "AppointmentTypeDefined"]);
  });

  it("allocates a fresh id when none is supplied", async () => {
    const { svc } = build();
    const r = await svc.defineResource("ops-1", { kind: "practitioner", name: N("Dr B") });
    expect(r.ok && r.value.id.length > 0).toBe(true);
    expect(await svc.resources()).toHaveLength(1);
  });

  it("rejects invalid config: unknown kind, non-bilingual name, non-positive duration", async () => {
    const { svc } = build();
    const badKind = await svc.defineResource("ops-1", { kind: "spaceship" as never, name: N("X") });
    expect(badKind.ok).toBe(false);
    if (!badKind.ok) expect(badKind.error.detailKey).toBe("scheduling.resource.bad_kind");

    const noArabic = await svc.defineResource("ops-1", { kind: "room", name: { ar: "", en: "Room 1" } });
    expect(noArabic.ok).toBe(false);
    if (!noArabic.ok) expect(noArabic.error.detailKey).toBe("scheduling.resource.bad_name");

    const badDuration = await svc.defineAppointmentType("ops-1", { name: N("T"), durationMin: 0, requiredResourceKinds: [] });
    expect(badDuration.ok).toBe(false);
    if (!badDuration.ok) expect(badDuration.error.detailKey).toBe("scheduling.appointment_type.bad_duration");

    const badTypeKind = await svc.defineAppointmentType("ops-1", { name: N("T"), durationMin: 30, requiredResourceKinds: ["hovercraft" as never] });
    expect(badTypeKind.ok).toBe(false);
    if (!badTypeKind.ok) expect(badTypeKind.error.detailKey).toBe("scheduling.resource.bad_kind");

    // nothing invalid was persisted
    expect(await svc.resources()).toHaveLength(0);
    expect(await svc.appointmentTypes()).toHaveLength(0);
  });

  it("a defined type + resource can be booked against immediately", async () => {
    const { svc } = build();
    const doc = await svc.defineResource("ops-1", { id: "res-doc-1", kind: "practitioner", name: N("Dr A") });
    const type = await svc.defineAppointmentType("ops-1", { id: "type-consult", name: N("Consultation"), durationMin: 30, requiredResourceKinds: ["practitioner"] });
    if (!doc.ok || !type.ok) throw new Error("setup");
    const booked = await svc.book("rec-1", { typeId: type.value.id, patientId: "pat-1", practitionerId: doc.value.id, resourceIds: [], start: "2026-06-13T09:00:00.000Z", end: "2026-06-13T09:30:00.000Z" });
    expect(booked.ok).toBe(true);
  });
});
