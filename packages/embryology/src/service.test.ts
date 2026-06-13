import { describe, expect, it } from "vitest";
import { fixedClock, ok, err, preconditionFailed, asId, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { EmbryologyService } from "./embryology-service.js";
import { InMemoryEmbryologyStore } from "./store.js";
import type { WitnessPort, HandlingEventInput } from "./witness-port.js";

class FakeWitness implements WitnessPort {
  readonly registered: HandlingEventInput[] = [];
  allow = true;
  async registerHandlingEvent(_actorId: string, input: HandlingEventInput): Promise<void> {
    this.registered.push(input);
  }
  async assertCycleStepSignOff(): Promise<Result<void, AppError>> {
    return this.allow ? ok(undefined) : err(preconditionFailed("blocked", "witnessing.sign_off.blocked"));
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryEmbryologyStore();
  const witness = new FakeWitness();
  return { svc: new EmbryologyService(store, witness, audit, events), witness, audit, events };
}

const CYCLE = "cycle-1";

describe("EmbryologyService — lab records", () => {
  it("records an oocyte (audited + event)", async () => {
    const { svc, audit, events } = build();
    const o = await svc.recordOocyte("emb-1", { cycleId: CYCLE, retrievalProcedureId: "proc-1", maturity: "MII", dish: "D1", position: "A1" });
    expect(o.maturity).toBe("MII");
    expect(await svc.oocytes(CYCLE)).toHaveLength(1);
    expect((await audit.entries())[0]!.payload.entityType).toBe("Oocyte");
    expect((await events.events())[0]!.payload.type).toBe("OocyteRecorded");
  });

  it("records insemination and registers a witnessing handling event", async () => {
    const { svc, witness } = build();
    await svc.recordInsemination("emb-1", { cycleId: CYCLE, oocyteId: "ooc-1", method: "ICSI", spermSourceId: "sp-1", operator: "emb-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" });
    expect(witness.registered).toHaveLength(1);
    expect(witness.registered[0]!.stepKey).toBe("insemination");
    expect(witness.registered[0]!.oxfordKey).toBe("cycle-1:insemination:ooc-1");
    const list = await svc.inseminations(CYCLE);
    expect(list).toHaveLength(1);
    expect(list[0]!.method).toBe("ICSI");
  });

  it("a 2PN check creates a culture embryo; abnormal PN does not", async () => {
    const { svc } = build();
    const normal = await svc.recordFertilisationCheck("emb-1", { cycleId: CYCLE, oocyteId: "ooc-1", pn: "2PN", checkedAt: "2026-06-23T08:00:00Z" });
    expect(normal.embryo).not.toBeNull();
    const abnormal = await svc.recordFertilisationCheck("emb-1", { cycleId: CYCLE, oocyteId: "ooc-2", pn: "3PN", checkedAt: "2026-06-23T08:00:00Z" });
    expect(abnormal.embryo).toBeNull();
    expect(await svc.embryos(CYCLE)).toHaveLength(1);
  });

  it("records grading with and without a Gardner grade, and rejects a bad grade", async () => {
    const { svc } = build();
    const withGrade = await svc.recordGrading("emb-1", { embryoId: "e-1", day: 5, morphology: "expanded blast", gardner: { expansion: 4, icm: "A", te: "B" }, assessedAt: "2026-06-27T08:00:00Z" });
    expect(withGrade.ok && withGrade.value.gardner).toEqual({ expansion: 4, icm: "A", te: "B" });
    const noGrade = await svc.recordGrading("emb-1", { embryoId: "e-1", day: 3, morphology: "8-cell", assessedAt: "2026-06-25T08:00:00Z" });
    expect(noGrade.ok && noGrade.value.gardner).toBeNull();
    const bad = await svc.recordGrading("emb-1", { embryoId: "e-1", day: 5, morphology: "x", gardner: { expansion: 9, icm: "A", te: "A" }, assessedAt: "z" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("embryology.grade.bad_expansion");
  });
});

describe("EmbryologyService — witnessing-gated terminal acts", () => {
  it("blocks disposition when the cycle does not reconcile, allows when it does", async () => {
    const { svc, witness } = build();
    witness.allow = false;
    const blocked = await svc.recordDisposition("emb-1", { cycleId: CYCLE, embryoId: "e-1", type: "freeze", occurredAt: "2026-06-27T09:00:00Z", operator: "emb-1", patientId: "pat-1" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("witnessing.sign_off.blocked");

    witness.allow = true;
    const allowed = await svc.recordDisposition("emb-1", { cycleId: CYCLE, embryoId: "e-1", type: "freeze", occurredAt: "2026-06-27T09:00:00Z", operator: "emb-1", patientId: "pat-1" });
    expect(allowed.ok).toBe(true);
    expect(witness.registered.some((r) => r.stepKey === "disposition.freeze")).toBe(true);
  });

  it("blocks transfer when the cycle does not reconcile, allows when it does", async () => {
    const { svc, witness } = build();
    witness.allow = false;
    const blocked = await svc.recordTransfer("emb-1", { cycleId: CYCLE, embryoIds: ["e-1"], catheter: "soft", difficulty: "easy", ultrasoundGuided: true, operator: "emb-1", transferredAt: "2026-06-27T10:00:00Z", patientId: "pat-1" });
    expect(blocked.ok).toBe(false);

    witness.allow = true;
    const allowed = await svc.recordTransfer("emb-1", { cycleId: CYCLE, embryoIds: ["e-1", "e-2"], catheter: "soft", difficulty: "moderate", ultrasoundGuided: true, procedureRef: "proc-9", operator: "emb-1", transferredAt: "2026-06-27T10:00:00Z", patientId: "pat-1" });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.value.count).toBe(2);
    expect(await svc.transfers(CYCLE)).toHaveLength(1);
  });

  it("exposes the sign-off gate directly", async () => {
    const { svc, witness } = build();
    witness.allow = false;
    expect((await svc.assertStepSignOff(CYCLE)).ok).toBe(false);
  });
});

describe("EmbryologyService — life-history reconstruction", () => {
  it("reconstructs an embryo's history and reports a missing embryo", async () => {
    const { svc } = build();
    const o = await svc.recordOocyte("emb-1", { cycleId: CYCLE, retrievalProcedureId: "proc-1", maturity: "MII", dish: "D1", position: "A1" });
    const check = await svc.recordFertilisationCheck("emb-1", { cycleId: CYCLE, oocyteId: o.id, pn: "2PN", checkedAt: "2026-06-23T08:00:00Z" });
    const embryoId = check.embryo!.id;
    await svc.recordGrading("emb-1", { embryoId, day: 5, morphology: "blast", gardner: { expansion: 4, icm: "A", te: "A" }, assessedAt: "2026-06-27T08:00:00Z" });
    await svc.recordDisposition("emb-1", { cycleId: CYCLE, embryoId, type: "freeze", occurredAt: "2026-06-27T09:00:00Z", operator: "emb-1", patientId: "pat-1" });

    const hist = await svc.embryoLifeHistory(embryoId);
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.oocyte!.id).toBe(o.id);
      expect(hist.value.checks).toHaveLength(1);
      expect(hist.value.gradings).toHaveLength(1);
      expect(hist.value.dispositions).toHaveLength(1);
    }

    const missing = await svc.embryoLifeHistory(asId<"Embryo">("nope"));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("embryology.embryo.not_found");
  });
});
