import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { MonitoringService } from "./monitoring-service.js";
import { InMemoryMonitoringStore } from "./monitoring-store.js";

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new MonitoringService(new InMemoryMonitoringStore(), audit, events), audit, events };
}

describe("MonitoringService.recordVisit", () => {
  it("records a continue decision (no procedure) and audits it", async () => {
    const { svc, audit, events } = build();
    const r = await svc.recordVisit("doc-1", "cycle-1", { visitAt: "2026-06-20T08:00:00Z", decision: "continue", nextVisitAt: "2026-06-22T08:00:00Z", note: "stim ongoing" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.retrieval).toBeNull();
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("MonitoringDecisionRecorded");
  });

  it("a trigger decision schedules a retrieval 36h later", async () => {
    const { svc } = build();
    const r = await svc.recordVisit("doc-1", "cycle-1", { visitAt: "2026-06-20T08:00:00Z", decision: "trigger", triggerAt: "2026-06-20T21:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.retrieval!.type).toBe("retrieval");
      expect(r.value.retrieval!.scheduledAt).toBe("2026-06-22T09:00:00.000Z");
    }
    expect(await svc.procedures("cycle-1")).toHaveLength(1);
  });

  it("rejects a trigger decision without a trigger time / with a bad time", async () => {
    const { svc } = build();
    const missing = await svc.recordVisit("doc-1", "cycle-1", { visitAt: "2026-06-20T08:00:00Z", decision: "trigger" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("fertility.trigger.missing_time");
    const bad = await svc.recordVisit("doc-1", "cycle-1", { visitAt: "2026-06-20T08:00:00Z", decision: "trigger", triggerAt: "nope" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("fertility.trigger.bad_time");
  });
});

describe("MonitoringService procedures", () => {
  it("schedules a transfer and links a theatre booking", async () => {
    const { svc } = build();
    const proc = await svc.scheduleProcedure("doc-1", "cycle-1", "transfer", "2026-06-27T10:00:00Z");
    expect(proc.theatreBookingRef).toBeNull();
    const linked = await svc.linkTheatreBooking("doc-1", proc, "appt-123");
    expect(linked.theatreBookingRef).toBe("appt-123");
    expect((await svc.procedure(proc.id, "cycle-1"))!.theatreBookingRef).toBe("appt-123");
    expect(await svc.visits("cycle-1")).toHaveLength(0);
  });
});
