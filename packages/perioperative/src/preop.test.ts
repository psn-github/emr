import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validatePreOp } from "./preop.js";
import { PreOpService } from "./preop-service.js";
import { InMemoryPreOpStore } from "./preop-store.js";

const good = { mallampatiClass: 2, asaGrade: 2, fastingConfirmed: true, consentRef: "consent-1" };

describe("validatePreOp (pure)", () => {
  it("accepts a valid assessment", () => {
    expect(validatePreOp(good).ok).toBe(true);
  });
  it("rejects an out-of-range ASA grade", () => {
    const r = validatePreOp({ ...good, asaGrade: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("perioperative.preop.bad_asa");
  });
  it("rejects an out-of-range Mallampati class", () => {
    const r = validatePreOp({ ...good, mallampatiClass: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("perioperative.preop.bad_airway");
  });
  it("requires confirmed fasting and a consent reference", () => {
    const fast = validatePreOp({ ...good, fastingConfirmed: false });
    expect(fast.ok).toBe(false);
    if (!fast.ok) expect(fast.error.detailKey).toBe("perioperative.preop.fasting_unconfirmed");
    const consent = validatePreOp({ ...good, consentRef: "  " });
    expect(consent.ok).toBe(false);
    if (!consent.ok) expect(consent.error.detailKey).toBe("perioperative.preop.consent_required");
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new PreOpService(new InMemoryPreOpStore(), audit, events), events };
}

describe("PreOpService", () => {
  it("records a valid assessment and retrieves it by encounter", async () => {
    const { svc, events } = build();
    const r = await svc.recordPreOp("anaes-1", { encounterId: "enc-1", anaestheticHistory: "nil", mallampatiClass: 2, asaGrade: 2, investigations: ["FBC"], fastingConfirmed: true, consentRef: "consent-1", assessedAt: "2026-06-22T07:00:00Z" });
    expect(r.ok && r.value.asaGrade).toBe(2);
    expect((await svc.forEncounter("enc-1"))!.consentRef).toBe("consent-1");
    expect((await events.events())[0]!.payload.type).toBe("PreOpAssessmentRecorded");
    // a valid record omitting investigations defaults to an empty list
    const r2 = await svc.recordPreOp("anaes-1", { encounterId: "enc-2", anaestheticHistory: "nil", mallampatiClass: 1, asaGrade: 1, fastingConfirmed: true, consentRef: "consent-2", assessedAt: "2026-06-22T07:00:00Z" });
    expect(r2.ok && r2.value.investigations).toEqual([]);
  });
  it("rejects an invalid assessment", async () => {
    const { svc } = build();
    const r = await svc.recordPreOp("anaes-1", { encounterId: "enc-1", anaestheticHistory: "nil", mallampatiClass: 2, asaGrade: 0, fastingConfirmed: true, consentRef: "c", assessedAt: "z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("perioperative.preop.bad_asa");
  });
});
