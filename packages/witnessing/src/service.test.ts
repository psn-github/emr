import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { WitnessingService, type RegisterHandlingInput } from "./witnessing-service.js";
import { InMemoryWitnessingStore } from "./store.js";
import { RiWitnessStubProvider } from "./provider.js";

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:30:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryWitnessingStore();
  const provider = new RiWitnessStubProvider();
  const svc = new WitnessingService(store, provider, audit, events, clock);
  return { svc, store, provider, audit, events };
}

const input = (over: Partial<RegisterHandlingInput> = {}): RegisterHandlingInput => ({
  cycleId: "cycle-1",
  stepKey: "insemination",
  oxfordKey: "cycle-1:insemination:sample-A",
  patientId: "pat-1",
  sampleId: "sample-A",
  occurredAt: "2026-06-22T08:00:00.000Z",
  ...over,
});

describe("WitnessingService.registerHandlingEvent", () => {
  it("records the event, pushes demographics, and starts pending_sync", async () => {
    const { svc, store, provider, audit, events } = build();
    const ev = await svc.registerHandlingEvent("embryologist-1", input());
    expect(ev.recordedBy).toBe("embryologist-1");
    expect(await store.eventsForCycle("cycle-1")).toHaveLength(1);
    expect(provider.pushedDemographics()).toEqual([{ patientId: "pat-1", cycleId: "cycle-1" }]);
    const recs = await store.reconciliationsForCycle("cycle-1");
    expect(recs[0]!.status).toBe("pending_sync");
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("HandlingEventRecorded");
  });
});

describe("WitnessingService.ingest", () => {
  it("matches an event once RI returns a confirming record", async () => {
    const { svc, provider } = build();
    const ev = await svc.registerHandlingEvent("embryologist-1", input());
    provider.seedMatching(ev, "ri-1", "2026-06-22T08:00:01.000Z");
    const rows = await svc.ingest("embryologist-1", "cycle-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("matched");
  });

  it("reports divergent and pending counts and emits a reconciled event", async () => {
    const { svc, provider, audit, events } = build();
    await svc.registerHandlingEvent("embryologist-1", input()); // stays pending (no RI)
    const diverged = await svc.registerHandlingEvent("embryologist-1", input({ oxfordKey: "cycle-1:icsi:sample-B", stepKey: "icsi", sampleId: "sample-B" }));
    provider.seedRecord("cycle-1", { riRecordId: "ri-2", oxfordKey: diverged.oxfordKey, patientId: "pat-999", sampleId: "sample-B", outcome: "witnessed", witnessedAt: "x" });
    const rows = await svc.ingest("embryologist-1", "cycle-1");
    expect(rows.filter((r) => r.status === "divergent")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "pending_sync")).toHaveLength(1);
    const lastAudit = (await audit.entries()).at(-1)!;
    expect(lastAudit.payload.after).toMatchObject({ divergent: 1, pending: 1 });
    expect((await events.events()).at(-1)!.payload.type).toBe("WitnessReconciled");
  });
});

describe("WitnessingService sign-off gate", () => {
  it("blocks while pending, allows once matched", async () => {
    const { svc, provider } = build();
    const ev = await svc.registerHandlingEvent("embryologist-1", input());
    const blocked = await svc.assertCycleStepSignOff("cycle-1");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("witnessing.sign_off.blocked");

    provider.seedMatching(ev, "ri-1", "2026-06-22T08:00:01.000Z");
    const allowed = await svc.assertCycleStepSignOff("cycle-1");
    expect(allowed.ok).toBe(true);
  });

  it("reconcileNow reflects live RI state without writing rows", async () => {
    const { svc, store, provider } = build();
    const ev = await svc.registerHandlingEvent("embryologist-1", input());
    provider.seedMatching(ev, "ri-1", "2026-06-22T08:00:01.000Z");
    const now = await svc.reconcileNow("cycle-1");
    expect(now[0]!.status).toBe("matched");
    // only the initial pending row was persisted; reconcileNow is read-only
    expect(await store.reconciliationsForCycle("cycle-1")).toHaveLength(1);
  });
});
