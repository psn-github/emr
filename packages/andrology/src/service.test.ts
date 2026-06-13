import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { AndrologyService } from "./andrology-service.js";
import { InMemoryAndrologyStore } from "./store.js";
import type { WitnessPort, HandlingEventInput } from "./witness-port.js";
import type { SemenParameters } from "./types.js";

class FakeWitness implements WitnessPort {
  readonly registered: HandlingEventInput[] = [];
  async registerHandlingEvent(_actorId: string, input: HandlingEventInput): Promise<void> {
    this.registered.push(input);
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const witness = new FakeWitness();
  return { svc: new AndrologyService(new InMemoryAndrologyStore(), witness, audit, events), witness, audit, events };
}

const params: SemenParameters = {
  volumeMl: 2.5,
  concentrationMillionPerMl: 40,
  totalCountMillion: 100,
  progressiveMotilityPct: 45,
  totalMotilityPct: 60,
  normalMorphologyPct: 6,
  vitalityPct: 70,
};

const PATIENT = "pat-1";

describe("AndrologyService — semen analysis", () => {
  it("records a normal analysis with WHO flags and audits it", async () => {
    const { svc, audit, events } = build();
    const r = await svc.recordSemenAnalysis("andro-1", { patientId: PATIENT, collectedAt: "2026-06-22T08:00:00Z", parameters: params });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.allWithinReference).toBe(true);
    expect(await svc.analyses(PATIENT)).toHaveLength(1);
    expect((await audit.entries())[0]!.payload.entityType).toBe("SemenAnalysis");
    expect((await events.events())[0]!.payload.type).toBe("SemenAnalysisRecorded");
  });

  it("rejects invalid parameters", async () => {
    const { svc } = build();
    const r = await svc.recordSemenAnalysis("andro-1", { patientId: PATIENT, collectedAt: "z", parameters: { ...params, volumeMl: -1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("andrology.semen.bad_value");
  });
});

describe("AndrologyService — prep, freeze, retrieval", () => {
  it("records a sperm preparation", async () => {
    const { svc } = build();
    const prep = await svc.recordPrep("andro-1", { patientId: PATIENT, method: "density_gradient", postPrepConcentrationMillionPerMl: 30, postPrepProgressiveMotilityPct: 80, preparedAt: "2026-06-22T09:00:00Z" });
    expect(prep.method).toBe("density_gradient");
    expect(await svc.preps(PATIENT)).toHaveLength(1);
  });

  it("records a witnessed sperm freeze with a cryostore link", async () => {
    const { svc, witness } = build();
    const freeze = await svc.recordFreeze("andro-1", { cycleId: "cycle-1", patientId: PATIENT, cryoSpecimenRef: "cryo-9", straws: 4, frozenAt: "2026-06-22T10:00:00Z" });
    expect(freeze.cryoSpecimenRef).toBe("cryo-9");
    expect(freeze.witnessKey).toBe("cycle-1:freeze.sperm:cryo-9");
    expect(witness.registered).toHaveLength(1);
    expect(witness.registered[0]!.stepKey).toBe("freeze.sperm");
    expect(witness.registered[0]!.sampleId).toBe("cryo-9");
    expect(await svc.freezes(PATIENT)).toHaveLength(1);
  });

  it("records a surgical retrieval linked to theatre", async () => {
    const { svc } = build();
    const r = await svc.recordSurgicalRetrieval("andro-1", { patientId: PATIENT, method: "TESE", theatreBookingRef: "appt-77", spermFound: true, performedAt: "2026-06-22T11:00:00Z" });
    expect(r.method).toBe("TESE");
    expect(r.spermFound).toBe(true);
    expect(await svc.retrievals(PATIENT)).toHaveLength(1);
  });
});
