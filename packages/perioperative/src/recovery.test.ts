import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validateAldrete, assertDischargeReady } from "./recovery.js";
import { RecoveryService } from "./recovery-service.js";
import { InMemoryRecoveryStore } from "./recovery-store.js";
import type { PharmacyPort } from "./ports.js";

describe("recovery (pure)", () => {
  it("validates the Aldrete score 0–10", () => {
    expect(validateAldrete(9).ok).toBe(true);
    expect(validateAldrete(11).ok).toBe(false);
    const bad = validateAldrete(-1);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("perioperative.recovery.bad_aldrete");
  });
  it("discharge needs prescription fulfilment first, then a follow-up", () => {
    const noScript = assertDischargeReady(false, true);
    expect(noScript.ok).toBe(false);
    if (!noScript.ok) expect(noScript.error.detailKey).toBe("perioperative.discharge.prescription_unfulfilled");
    const noFu = assertDischargeReady(true, false);
    expect(noFu.ok).toBe(false);
    if (!noFu.ok) expect(noFu.error.detailKey).toBe("perioperative.discharge.followup_required");
    expect(assertDischargeReady(true, true).ok).toBe(true);
  });
});

class FakePharmacy implements PharmacyPort {
  fulfilled = false;
  async isPrescriptionFulfilled(): Promise<boolean> {
    return this.fulfilled;
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T10:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const pharmacy = new FakePharmacy();
  return { svc: new RecoveryService(new InMemoryRecoveryStore(), pharmacy, audit, events), pharmacy };
}

describe("RecoveryService", () => {
  it("records observations (Aldrete validated) and rejects a bad score", async () => {
    const { svc } = build();
    const r = await svc.recordObservation("nurse-1", { encounterId: "enc-1", phase: "recovery", aldreteScore: 9, systolicBp: 120, heartRate: 70, spo2: 98, recordedAt: "2026-06-22T10:00:00Z" });
    expect(r.ok).toBe(true);
    expect(await svc.observations("enc-1")).toHaveLength(1);
    const bad = await svc.recordObservation("nurse-1", { encounterId: "enc-1", phase: "recovery", aldreteScore: 99, systolicBp: 120, heartRate: 70, spo2: 98, recordedAt: "z" });
    expect(bad.ok).toBe(false);
    // an observation without an Aldrete score (ward obs) is fine
    expect((await svc.recordObservation("nurse-1", { encounterId: "enc-1", phase: "post_op_ward", systolicBp: 118, heartRate: 72, spo2: 99, recordedAt: "z" })).ok).toBe(true);
  });

  it("the discharge gate: blocked until prescription fulfilled AND follow-up booked", async () => {
    const { svc, pharmacy } = build();
    expect((await svc.assertMayDischarge("enc-1")).ok).toBe(false); // nothing yet
    pharmacy.fulfilled = true;
    expect((await svc.assertMayDischarge("enc-1")).ok).toBe(false); // still no follow-up
    await svc.bookFollowUp("nurse-1", { encounterId: "enc-1", scheduledFor: "2026-07-01T09:00:00Z", bookedAt: "2026-06-22T11:00:00Z" });
    expect((await svc.assertMayDischarge("enc-1")).ok).toBe(true);
  });
});
