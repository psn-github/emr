import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { OutcomesService } from "./outcomes-service.js";
import { InMemoryOutcomesStore } from "./store.js";

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new OutcomesService(new InMemoryOutcomesStore(), audit, events), audit, events };
}

const CYCLE = "cycle-1";

describe("OutcomesService — recording stages", () => {
  it("records a positive/negative β-hCG test and rejects a bad value", async () => {
    const { svc, events } = build();
    const pos = await svc.recordPregnancyTest("doc-1", { cycleId: CYCLE, betaHcgMiuMl: 120, testedAt: "2026-07-05T08:00:00Z" });
    expect(pos.ok && pos.value.result).toBe("positive");
    const neg = await svc.recordPregnancyTest("doc-1", { cycleId: CYCLE, betaHcgMiuMl: 2, testedAt: "2026-07-05T08:00:00Z" });
    expect(neg.ok && neg.value.result).toBe("negative");
    const bad = await svc.recordPregnancyTest("doc-1", { cycleId: CYCLE, betaHcgMiuMl: -5, testedAt: "z" });
    expect(bad.ok).toBe(false);
    expect((await events.events())[0]!.payload.type).toBe("PregnancyTestRecorded");
  });

  it("records a clinical assessment, deriving clinical-pregnancy from sacs", async () => {
    const { svc } = build();
    const clin = await svc.recordClinicalAssessment("doc-1", { cycleId: CYCLE, gestationalSacs: 1, fetalHeartbeats: 1, assessedAt: "2026-07-20T08:00:00Z" });
    expect(clin.clinicalPregnancy).toBe(true);
    const biochem = await svc.recordClinicalAssessment("doc-1", { cycleId: CYCLE, gestationalSacs: 0, fetalHeartbeats: 0, assessedAt: "2026-07-20T08:00:00Z" });
    expect(biochem.clinicalPregnancy).toBe(false);
  });

  it("records a pregnancy outcome; a live birth requires a count ≥ 1", async () => {
    const { svc } = build();
    const lb = await svc.recordPregnancyOutcome("doc-1", { cycleId: CYCLE, type: "live_birth", liveBirthCount: 1, gestationalAgeWeeks: 39, occurredAt: "2027-03-01T08:00:00Z" });
    expect(lb.ok && lb.value.liveBirthCount).toBe(1);
    const missing = await svc.recordPregnancyOutcome("doc-1", { cycleId: CYCLE, type: "live_birth", occurredAt: "z" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("outcomes.live_birth.count_required");
    const badCount = await svc.recordPregnancyOutcome("doc-1", { cycleId: CYCLE, type: "miscarriage", liveBirthCount: -1, occurredAt: "z" });
    expect(badCount.ok).toBe(false);
    if (!badCount.ok) expect(badCount.error.detailKey).toBe("outcomes.live_birth.bad_count");
    const mc = await svc.recordPregnancyOutcome("doc-1", { cycleId: CYCLE, type: "miscarriage", occurredAt: "2026-09-01T08:00:00Z" });
    expect(mc.ok && mc.value.liveBirthCount).toBe(0);
  });
});

describe("OutcomesService — continuum reconstruction", () => {
  it("reconstructs the continuum for a cycle and derives KPI inputs; empty cycle is all-null/false", async () => {
    const { svc } = build();
    const empty = await svc.outcomeForCycle("cycle-empty");
    expect(empty).toEqual({ cycleId: "cycle-empty", test: null, clinicalAssessment: null, outcome: null });
    expect(await svc.kpiInputs("cycle-empty")).toEqual({ biochemicalPregnancy: false, clinicalPregnancy: false, liveBirth: false, ongoing: false });

    await svc.recordPregnancyTest("doc-1", { cycleId: CYCLE, betaHcgMiuMl: 120, testedAt: "2026-07-05T08:00:00Z" });
    await svc.recordClinicalAssessment("doc-1", { cycleId: CYCLE, gestationalSacs: 1, fetalHeartbeats: 1, assessedAt: "2026-07-20T08:00:00Z" });
    await svc.recordPregnancyOutcome("doc-1", { cycleId: CYCLE, type: "live_birth", liveBirthCount: 1, occurredAt: "2027-03-01T08:00:00Z" });

    const summary = await svc.outcomeForCycle(CYCLE);
    expect(summary.test!.result).toBe("positive");
    expect(summary.clinicalAssessment!.clinicalPregnancy).toBe(true);
    expect(summary.outcome!.type).toBe("live_birth");
    expect(await svc.kpiInputs(CYCLE)).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, ongoing: false });
  });

  it("produces a de-identified research export and audits it as a sensitive read", async () => {
    const { svc, audit } = build();
    const rows = await svc.researchExport("researcher-1", [
      { cycleId: CYCLE, patientRef: "person-1", ageYears: 36, cycleType: "IVF", protocol: "long", oocytesRetrieved: 10, matureOocytes: 8, twoPnZygotes: 6, embryosTransferred: 2, biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, liveBirthCount: 1 },
    ], "secret-salt");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ageBand).toBe("35-37");
    expect(JSON.stringify(rows)).not.toContain("person-1");
    const exportAudits = (await audit.entries()).filter((e) => e.payload.action === "READ_EXPORT" && e.payload.entityType === "ResearchRegistryExport");
    expect(exportAudits).toHaveLength(1);
  });
});
