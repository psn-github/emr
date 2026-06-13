import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import {
  WHO_REQUIRED_ITEMS,
  phaseComplete,
  assertMayEnterTheatre,
  assertMayLeaveTheatre,
  assertPhaseOrder,
  assertPhaseItemsComplete,
  type WhoChecklist,
} from "./who-checklist.js";
import { WhoChecklistService } from "./who-service.js";
import { InMemoryWhoChecklistStore } from "./who-store.js";

const rec = (phase: keyof typeof WHO_REQUIRED_ITEMS) => ({ confirmedItems: WHO_REQUIRED_ITEMS[phase], completedBy: "u", completedAt: "t" });
const checklist = (over: Partial<WhoChecklist> = {}): WhoChecklist => ({ encounterId: "e", sign_in: null, time_out: null, sign_out: null, ...over });

describe("WHO checklist (pure)", () => {
  it("a phase is complete only with every required item", () => {
    expect(phaseComplete(null, "sign_in")).toBe(false);
    expect(phaseComplete({ confirmedItems: ["identity_confirmed"], completedBy: "u", completedAt: "t" }, "sign_in")).toBe(false);
    expect(phaseComplete(rec("sign_in"), "sign_in")).toBe(true);
  });

  it("flags missing items for a phase", () => {
    const r = assertPhaseItemsComplete("time_out", ["team_introduced"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("perioperative.who.items_incomplete");
    expect(assertPhaseItemsComplete("time_out", WHO_REQUIRED_ITEMS.time_out).ok).toBe(true);
  });

  it("enforces phase order", () => {
    expect(assertPhaseOrder(checklist(), "sign_in").ok).toBe(true);
    expect(assertPhaseOrder(checklist(), "time_out").ok).toBe(false);
    expect(assertPhaseOrder(checklist({ sign_in: rec("sign_in") }), "time_out").ok).toBe(true);
    expect(assertPhaseOrder(checklist({ sign_in: rec("sign_in") }), "sign_out").ok).toBe(false);
    expect(assertPhaseOrder(checklist({ sign_in: rec("sign_in"), time_out: rec("time_out") }), "sign_out").ok).toBe(true);
  });

  it("blocks theatre entry until sign-in + time-out, and exit until sign-out", () => {
    expect(assertMayEnterTheatre(checklist()).ok).toBe(false);
    expect(assertMayEnterTheatre(checklist({ sign_in: rec("sign_in") })).ok).toBe(false);
    const ready = checklist({ sign_in: rec("sign_in"), time_out: rec("time_out") });
    expect(assertMayEnterTheatre(ready).ok).toBe(true);
    expect(assertMayLeaveTheatre(ready).ok).toBe(false);
    expect(assertMayLeaveTheatre(checklist({ ...ready, sign_out: rec("sign_out") })).ok).toBe(true);
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new WhoChecklistService(new InMemoryWhoChecklistStore(), audit, events), events };
}

describe("WhoChecklistService", () => {
  it("completes phases in order and then permits theatre entry + exit", async () => {
    const { svc, events } = build();
    const out = await svc.completePhase("nurse-1", "enc-1", "sign_in", WHO_REQUIRED_ITEMS.sign_in, "t1");
    expect(out.ok).toBe(true);
    expect((await events.events())[0]!.payload.type).toBe("WhoChecklistPhaseCompleted");
    await svc.completePhase("nurse-1", "enc-1", "time_out", WHO_REQUIRED_ITEMS.time_out, "t2");
    expect((await svc.assertMayEnterTheatre("enc-1")).ok).toBe(true);
    expect((await svc.assertMayLeaveTheatre("enc-1")).ok).toBe(false);
    await svc.completePhase("nurse-1", "enc-1", "sign_out", WHO_REQUIRED_ITEMS.sign_out, "t3");
    expect((await svc.assertMayLeaveTheatre("enc-1")).ok).toBe(true);
    expect((await svc.get("enc-1"))!.sign_out).not.toBeNull();
  });

  it("rejects an out-of-order phase and an incomplete one", async () => {
    const { svc } = build();
    const order = await svc.completePhase("n", "enc-2", "time_out", WHO_REQUIRED_ITEMS.time_out, "t");
    expect(order.ok).toBe(false);
    if (!order.ok) expect(order.error.detailKey).toBe("perioperative.who.out_of_order");
    const incomplete = await svc.completePhase("n", "enc-2", "sign_in", ["identity_confirmed"], "t");
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error.detailKey).toBe("perioperative.who.items_incomplete");
  });

  it("an unknown encounter is treated as an empty checklist (blocks entry + exit)", async () => {
    const { svc } = build();
    expect((await svc.assertMayEnterTheatre("nope")).ok).toBe(false);
    expect((await svc.assertMayLeaveTheatre("nope")).ok).toBe(false);
  });
});
