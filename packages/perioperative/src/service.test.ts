import { describe, expect, it } from "vitest";
import { fixedClock, ok, err, conflict, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { PerioperativeService } from "./perioperative-service.js";
import { InMemoryPerioperativeStore } from "./store.js";
import type { FacilityFlowPort } from "./ports.js";
import type { CareLocationKind } from "./journey.js";
import type { JourneyStage } from "./types.js";

class FakeFlow implements FacilityFlowPort {
  placeOk = true;
  releaseOk = true;
  readonly placements: { kind: CareLocationKind; status: string }[] = [];
  async place(_a: string, _p: string, kind: CareLocationKind, status: string): Promise<Result<{ locationNodeId: string }, AppError>> {
    if (!this.placeOk) return err(conflict("no free bed", "facility.bed.occupied"));
    this.placements.push({ kind, status });
    return ok({ locationNodeId: `node-${kind}` });
  }
  async release(): Promise<Result<void, AppError>> {
    return this.releaseOk ? ok(undefined) : err(conflict("release failed", "facility.flow.release_failed"));
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const flow = new FakeFlow();
  return { svc: new PerioperativeService(new InMemoryPerioperativeStore(), flow, audit, events), flow, audit, events };
}

const admit = (svc: PerioperativeService) => svc.admit("nurse-1", { patientId: "pat-1", indication: "oocyte retrieval", admittedAt: "2026-06-22T08:00:00Z" });

describe("PerioperativeService.admit", () => {
  it("admits on L3 (placed + audited + event)", async () => {
    const { svc, flow, audit, events } = build();
    const r = await admit(svc);
    expect(r.ok && r.value.stage).toBe("admitted");
    expect(flow.placements[0]).toEqual({ kind: "l3_admit", status: "admitted" });
    expect((await audit.entries())[0]!.payload.entityType).toBe("SurgicalEncounter");
    expect((await events.events())[0]!.payload.type).toBe("SurgicalEncounterAdmitted");
  });

  it("fails admission if placement has no capacity", async () => {
    const { svc, flow } = build();
    flow.placeOk = false;
    const r = await admit(svc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("facility.bed.occupied");
  });
});

describe("PerioperativeService.advanceJourney", () => {
  it("runs the full pathway, driving a movement at each stage", async () => {
    const { svc, flow } = build();
    const a = await admit(svc);
    if (!a.ok) return;
    const id = a.value.id;
    const stages: JourneyStage[] = ["ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward", "discharged"];
    for (const s of stages) {
      const r = await svc.advanceJourney("nurse-1", id, s);
      expect(r.ok && r.value.stage).toBe(s);
    }
    // 1 admit + 5 placements (discharged releases, not places)
    expect(flow.placements).toHaveLength(6);
    expect(await svc.active()).toHaveLength(0); // discharged is not active
  });

  it("rejects a missing encounter, an illegal transition, and a cancel via advance", async () => {
    const { svc } = build();
    expect((await svc.advanceJourney("n", "missing" as never, "ward_bed")).ok).toBe(false);
    const a = await admit(svc);
    if (!a.ok) return;
    const illegal = await svc.advanceJourney("n", a.value.id, "in_theatre");
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.error.detailKey).toBe("perioperative.bad_transition");
    const viaAdvance = await svc.advanceJourney("n", a.value.id, "cancelled");
    expect(viaAdvance.ok).toBe(false);
    if (!viaAdvance.ok) expect(viaAdvance.error.detailKey).toBe("perioperative.use_cancel");
  });

  it("propagates a capacity failure on a placement stage and a release failure on discharge", async () => {
    const { svc, flow } = build();
    const a = await admit(svc);
    if (!a.ok) return;
    flow.placeOk = false;
    const blocked = await svc.advanceJourney("n", a.value.id, "ward_bed");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("facility.bed.occupied");

    // walk to post_op_ward, then fail the discharge release
    flow.placeOk = true;
    for (const s of ["ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward"] as const) await svc.advanceJourney("n", a.value.id, s);
    flow.releaseOk = false;
    const dis = await svc.advanceJourney("n", a.value.id, "discharged");
    expect(dis.ok).toBe(false);
    if (!dis.ok) expect(dis.error.detailKey).toBe("facility.flow.release_failed");
  });
});

describe("PerioperativeService.active", () => {
  it("excludes discharged and cancelled encounters", async () => {
    const { svc } = build();
    const discharged = await admit(svc);
    const cancelled = await admit(svc);
    const live = await admit(svc);
    if (!discharged.ok || !cancelled.ok || !live.ok) return;
    for (const s of ["ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward", "discharged"] as const) {
      await svc.advanceJourney("n", discharged.value.id, s);
    }
    await svc.cancel("n", cancelled.value.id, "x");
    const active = await svc.active();
    expect(active.map((e) => e.id)).toEqual([live.value.id]);
  });
});

describe("PerioperativeService.cancel", () => {
  it("cancels from a non-terminal stage, freeing the bed", async () => {
    const { svc } = build();
    const a = await admit(svc);
    if (!a.ok) return;
    await svc.advanceJourney("n", a.value.id, "ward_bed");
    const c = await svc.cancel("nurse-1", a.value.id, "patient unwell");
    expect(c.ok && c.value.stage).toBe("cancelled");
    if (c.ok) expect(c.value.cancellationReason).toBe("patient unwell");
    expect((await svc.get(a.value.id))!.stage).toBe("cancelled");
  });

  it("rejects cancelling a missing encounter, an already-discharged one, and propagates release failure", async () => {
    const { svc, flow } = build();
    expect((await svc.cancel("n", "missing" as never, "x")).ok).toBe(false);
    const a = await admit(svc);
    if (!a.ok) return;
    flow.releaseOk = false;
    const relFail = await svc.cancel("n", a.value.id, "x");
    expect(relFail.ok).toBe(false);
    if (!relFail.ok) expect(relFail.error.detailKey).toBe("facility.flow.release_failed");
    flow.releaseOk = true;
    for (const s of ["ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward", "discharged"] as const) await svc.advanceJourney("n", a.value.id, s);
    const afterDischarge = await svc.cancel("n", a.value.id, "too late");
    expect(afterDischarge.ok).toBe(false);
    if (!afterDischarge.ok) expect(afterDischarge.error.detailKey).toBe("perioperative.bad_transition");
  });
});
