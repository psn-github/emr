import { describe, expect, it } from "vitest";
import { fixedClock, asId, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CycleService } from "./cycle-service.js";
import { InMemoryCycleStore } from "./store.js";
import type { FertilityGate } from "./gate.js";
import type { CycleId } from "./types.js";

const allowGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: true, value: undefined }) };
const denyGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: false, error: preconditionFailed("no verified marriage", "registry.marriage.unverified") }) };

function build(gate: FertilityGate = allowGate) {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new CycleService(new InMemoryCycleStore(), audit, events, clock, gate), audit, events };
}

describe("CycleService.createTreatmentCycle", () => {
  it("creates a couple-scoped cycle when the marriage gate allows", async () => {
    const { svc, audit } = build();
    const r = await svc.createTreatmentCycle("doc-1", "icsi", "couple-1", "antagonist");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.owner).toEqual({ kind: "couple", coupleId: "couple-1" });
      expect(r.value.status).toBe("planned");
    }
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
  });

  it("rejects a preservation type through the treatment path", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "fertility_preservation", "couple-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("fertility.preservation_is_person_scoped");
  });

  it("is blocked by the marriage gate", async () => {
    const { svc } = build(denyGate);
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });
});

describe("CycleService.createPreservationCycle", () => {
  it("creates a person-scoped preservation cycle with no couple", async () => {
    const { svc } = build();
    const cycle = await svc.createPreservationCycle("doc-1", "person-1");
    expect(cycle.type).toBe("fertility_preservation");
    expect(cycle.owner).toEqual({ kind: "person", personId: "person-1" });
  });
});

describe("CycleService consent + lifecycle", () => {
  it("blocks leaving planned until consents complete, then advances", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "icsi", "couple-1");
    if (!r.ok) throw new Error("setup");
    const id = r.value.id;

    const blocked = await svc.advanceStatus("doc-1", id, "stimulating");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("fertility.consent.incomplete");

    for (const c of ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]) await svc.recordConsent("doc-1", id, c);
    await svc.recordConsent("doc-1", id, "consent.icsi"); // idempotent re-sign
    const advanced = await svc.advanceStatus("doc-1", id, "stimulating");
    expect(advanced.ok && advanced.value.status).toBe("stimulating");
  });

  it("allows cancelling out of planned without consents", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const cancelled = await svc.advanceStatus("doc-1", r.value.id, "cancelled");
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("rejects illegal transitions and missing cycles", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const bad = await svc.advanceStatus("doc-1", r.value.id, "transfer"); // planned→transfer illegal
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("fertility.bad_transition");
    expect((await svc.advanceStatus("doc-1", asId<"Cycle">("ghost") as CycleId, "stimulating")).ok).toBe(false);
    expect((await svc.recordConsent("doc-1", asId<"Cycle">("ghost") as CycleId, "c")).ok).toBe(false);
    expect((await svc.get(r.value.id)) !== null).toBe(true);
  });

  it("cancels with a reason and rejects cancel from a terminal/missing cycle", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const c = await svc.cancel("doc-1", r.value.id, "patient withdrew");
    expect(c.ok && c.value.cancellationReason).toBe("patient withdrew");
    const again = await svc.cancel("doc-1", r.value.id, "x"); // already cancelled → illegal
    expect(again.ok).toBe(false);
    expect((await svc.cancel("doc-1", asId<"Cycle">("ghost") as CycleId, "x")).ok).toBe(false);
  });
});
