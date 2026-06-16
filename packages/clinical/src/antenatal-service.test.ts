import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { AntenatalService } from "./antenatal-service.js";
import { InMemoryAntenatalStore } from "./antenatal-store.js";
import type { PregnancyId } from "./types.js";

function build() {
  const clock = fixedClock(new Date("2026-06-16T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new AntenatalService(new InMemoryAntenatalStore(), audit, events, clock), events };
}

describe("AntenatalService", () => {
  it("books a pregnancy (computes EDD), and blocks a second active one", async () => {
    const { svc } = build();
    const r = await svc.bookPregnancy("doc-1", { patientId: "pat-1", lmp: "2026-01-01", gravida: 2, para: 1, riskFactors: ["prior_pre_eclampsia"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.edd).toBe("2026-10-08");
      expect(r.value.status).toBe("active");
    }
    expect(await svc.activePregnancyForPatient("pat-1")).not.toBeNull();
    const dup = await svc.bookPregnancy("doc-1", { patientId: "pat-1", lmp: "2026-02-01", gravida: 2, para: 1 });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.detailKey).toBe("clinical.antenatal.already_active");
  });

  it("returns the planned schedule, and not-found for an unknown pregnancy", async () => {
    const { svc } = build();
    const r = await svc.bookPregnancy("doc-1", { patientId: "pat-1", lmp: "2026-01-01", gravida: 1, para: 0 });
    if (!r.ok) throw new Error("setup");
    const sched = await svc.plannedSchedule(r.value.id);
    expect(sched.ok && sched.value[0]!.week).toBe(8);
    const missing = await svc.plannedSchedule(asId<"Pregnancy">("ghost") as PregnancyId);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("clinical.antenatal.not_found");
  });

  it("records a visit deriving gestation + risk flags, emitting a risk event", async () => {
    const { svc, events } = build();
    const r = await svc.bookPregnancy("doc-1", { patientId: "pat-1", lmp: "2026-01-01", gravida: 1, para: 0 });
    if (!r.ok) throw new Error("setup");
    // normal visit
    const v1 = await svc.recordVisit("doc-1", { pregnancyId: r.value.id, visitAt: "2026-04-02", bpSystolic: 118, bpDiastolic: 76 });
    expect(v1.ok && v1.value.gestationWeeks).toBe(13); // ~13 weeks from Jan 1
    expect(v1.ok && v1.value.riskFlags).toEqual([]);
    // pre-eclampsia visit (hypertensive + proteinuria, third trimester)
    const v2 = await svc.recordVisit("doc-1", { pregnancyId: r.value.id, visitAt: "2026-08-01", bpSystolic: 150, bpDiastolic: 95, proteinuria: true });
    expect(v2.ok && v2.value.riskFlags).toContain("pre_eclampsia_risk");
    expect(await svc.visits(r.value.id)).toHaveLength(2);

    const emitted = await events.events();
    expect(emitted.some((e) => e.payload.type === "AntenatalRiskFlagged")).toBe(true);
    expect(emitted.some((e) => e.payload.type === "AntenatalVisitRecorded")).toBe(true);
  });

  it("rejects a visit for an unknown pregnancy and reads a pregnancy by id", async () => {
    const { svc } = build();
    const missing = await svc.recordVisit("doc-1", { pregnancyId: "ghost", visitAt: "2026-04-02", bpSystolic: 120, bpDiastolic: 80 });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("clinical.antenatal.not_found");
    expect(await svc.pregnancy(asId<"Pregnancy">("ghost") as PregnancyId)).toBeNull();
  });
});
