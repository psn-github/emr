import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CryostoreService } from "./cryostore-service.js";
import { InMemoryCryostoreStore } from "./store.js";
import type { WitnessPort, UseGate, BillingPort, HandlingEventInput, StorageChargeLine } from "./ports.js";
import type { ThawFacts } from "./ownership.js";
import type { CryoPosition, SpecimenOwner } from "./types.js";

class FakeWitness implements WitnessPort {
  readonly registered: HandlingEventInput[] = [];
  async registerHandlingEvent(_a: string, i: HandlingEventInput): Promise<void> {
    this.registered.push(i);
  }
}
class FakeUseGate implements UseGate {
  facts: ThawFacts = { coupleVerified: true, coupleIncludesOwner: true, ownerAlive: true };
  async thawFacts(_owner: SpecimenOwner, _coupleId: string): Promise<ThawFacts> {
    return this.facts;
  }
}
class FakeBilling implements BillingPort {
  readonly charges: { patientId: string; line: StorageChargeLine }[] = [];
  async raiseStorageCharge(_a: string, patientId: string, line: StorageChargeLine): Promise<string> {
    this.charges.push({ patientId, line });
    return "inv-1";
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const witness = new FakeWitness();
  const gate = new FakeUseGate();
  const billing = new FakeBilling();
  const svc = new CryostoreService(new InMemoryCryostoreStore(), witness, gate, billing, audit, events, clock);
  return { svc, witness, gate, billing, audit, events };
}

const POS: CryoPosition = { tankId: "t1", canister: "c1", cane: "k1", position: "p1" };
const POS2: CryoPosition = { tankId: "t1", canister: "c1", cane: "k1", position: "p2" };
const coupleOwner: SpecimenOwner = { kind: "couple", id: "cpl-1" };
const personOwner: SpecimenOwner = { kind: "person", id: "per-1" };

async function freeze(svc: CryostoreService, owner: SpecimenOwner, position = POS, kind: "sperm" | "embryo" = "sperm") {
  const r = await svc.freezeIntoStorage("emb-1", { kind, owner, cycleId: "cycle-1", straws: 2, position, freezeEventRef: "fz-1", patientId: "pat-1", occurredAt: "2026-06-22T08:00:00Z" });
  if (!r.ok) throw new Error("freeze failed");
  return r.value;
}

describe("CryostoreService — topology + custody", () => {
  it("registers a tank, freezes into an unoccupied position (witnessed), and locates it", async () => {
    const { svc, witness } = build();
    await svc.registerTank("emb-1", "Tank A");
    expect(await svc.tanks()).toHaveLength(1);
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    expect(witness.registered[0]!.stepKey).toBe("cryo.freeze");
    const loc = await svc.locate(s.id);
    expect(loc.ok && loc.value.custody).toHaveLength(1);
  });

  it("refuses to freeze into an occupied position", async () => {
    const { svc } = build();
    await freeze(svc, coupleOwner, POS, "embryo");
    const r = await svc.freezeIntoStorage("emb-1", { kind: "embryo", owner: coupleOwner, cycleId: "cycle-1", straws: 1, position: POS, freezeEventRef: "fz-2", patientId: "pat-1", occurredAt: "z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.position_occupied");
  });

  it("moves a specimen to a free position; rejects move to occupied / missing / non-stored", async () => {
    const { svc } = build();
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    const moved = await svc.move("emb-1", s.id, POS2, "pat-1", "z");
    expect(moved.ok && moved.value.position).toEqual(POS2);
    // occupy POS2 with another, then try to move first one back onto it
    const s2 = await freeze(svc, coupleOwner, POS, "embryo");
    const blocked = await svc.move("emb-1", s2.id, POS2, "pat-1", "z");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("cryostore.position_occupied");
    expect((await svc.move("emb-1", "missing" as never, POS, "pat-1", "z")).ok).toBe(false);
    // discard then attempt move → not stored
    await svc.discard("emb-1", s.id, "QA", "pat-1", "z");
    expect((await svc.move("emb-1", s.id, POS, "pat-1", "z")).ok).toBe(false);
  });

  it("lists everything for an owner", async () => {
    const { svc } = build();
    await freeze(svc, coupleOwner, POS, "embryo");
    await freeze(svc, coupleOwner, POS2, "embryo");
    expect(await svc.listForOwner(coupleOwner)).toHaveLength(2);
    expect((await svc.locate("nope" as never)).ok).toBe(false);
  });
});

describe("CryostoreService — thaw re-gate + discard", () => {
  it("thaws when the re-gate passes and blocks when it fails", async () => {
    const { svc, gate } = build();
    const s = await freeze(svc, personOwner, POS, "sperm");
    gate.facts = { coupleVerified: true, coupleIncludesOwner: false, ownerAlive: true };
    const blocked = await svc.thawForTreatment("emb-1", s.id, "cpl-1", "pat-1", "z");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("cryostore.thaw.owner_not_in_couple");
    gate.facts = { coupleVerified: true, coupleIncludesOwner: true, ownerAlive: true };
    const ok = await svc.thawForTreatment("emb-1", s.id, "cpl-1", "pat-1", "z");
    expect(ok.ok && ok.value.status).toBe("thawed");
    expect((await svc.thawForTreatment("emb-1", "nope" as never, "cpl-1", "pat-1", "z")).ok).toBe(false);
  });

  it("discards a stored specimen (witnessed); rejects missing and already-discarded", async () => {
    const { svc } = build();
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    const d = await svc.discard("emb-1", s.id, "non-viable", "pat-1", "z");
    expect(d.ok && d.value.status).toBe("discarded");
    expect((await svc.discard("emb-1", "nope" as never, "x", "pat-1", "z")).ok).toBe(false);
    const again = await svc.discard("emb-1", s.id, "x", "pat-1", "z");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("cryostore.not_stored");
  });
});

describe("CryostoreService — consent / monitoring", () => {
  it("records consent and lists expiring/expired consents", async () => {
    const { svc } = build();
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    await svc.recordStorageConsent("emb-1", s.id, "2026-01-01T00:00:00.000Z", 1); // expires 2027-01-01
    const due = await svc.expiringConsents(new Date("2026-12-20T00:00:00.000Z"), 30);
    expect(due).toHaveLength(1);
    const none = await svc.expiringConsents(new Date("2026-01-02T00:00:00.000Z"), 30);
    expect(none).toHaveLength(0);
    expect((await svc.consentFor(s.id))!.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    // re-record (renewal) updates the same specimen's consent in place
    await svc.recordStorageConsent("emb-1", s.id, "2027-01-01T00:00:00.000Z", 2);
    expect((await svc.consentFor(s.id))!.expiresAt).toBe("2029-01-01T00:00:00.000Z");
  });

  it("records a tank reading and alerts on a breach (high temp or low level)", async () => {
    const { svc } = build();
    const okReading = await svc.recordTankReading("tech-1", "t1", -190, 80, "z");
    expect(okReading.alert).toBe(false);
    const hot = await svc.recordTankReading("tech-1", "t1", -100, 80, "z");
    expect(hot.alert).toBe(true);
    const low = await svc.recordTankReading("tech-1", "t1", -190, 5, "z");
    expect(low.alert).toBe(true);
    expect(await svc.tankReadings("t1")).toHaveLength(3);
  });
});

describe("CryostoreService — AMD-0003 billing + non-engagement", () => {
  it("raises an annual storage charge via the billing seam", async () => {
    const { svc, billing } = build();
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    const r = await svc.raiseAnnualStorageCharge("fin-1", s.id, "pat-1", { chargeCode: "CRYO-STORE-Y", descriptionEn: "Annual storage", descriptionAr: "تخزين سنوي", amountFils: 50000 });
    expect(r.ok && r.value.invoiceId).toBe("inv-1");
    expect(billing.charges).toHaveLength(1);
    expect((await svc.raiseAnnualStorageCharge("fin-1", "nope" as never, "pat-1", { chargeCode: "x", descriptionEn: "x", descriptionAr: "x", amountFils: 1 })).ok).toBe(false);
  });

  it("advances the non-engagement pathway and never destroys; rejects bad transitions", async () => {
    const { svc } = build();
    const s = await freeze(svc, coupleOwner, POS, "embryo");
    expect((await svc.advanceEngagement("fin-1", s.id, "remind")).ok).toBe(true);
    expect((await svc.advanceEngagement("fin-1", s.id, "mark_overdue")).ok).toBe(true);
    const review = await svc.advanceEngagement("fin-1", s.id, "escalate_review");
    expect(review.ok && review.value).toBe("in_legal_review");
    expect(await svc.engagementState(s.id)).toBe("in_legal_review");
    const bad = await svc.advanceEngagement("fin-1", s.id, "mark_overdue");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("cryostore.engagement.bad_transition");
  });
});
