import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { RiWitnessStubProvider } from "./provider.js";
import { InMemoryWitnessingStore } from "./store.js";
import type { OxfordHandlingEvent, WitnessReconciliation } from "./types.js";

describe("RiWitnessStubProvider", () => {
  it("seeds multiple records on one cycle and returns them", async () => {
    const p = new RiWitnessStubProvider();
    p.seedRecord("cycle-1", { riRecordId: "ri-1", oxfordKey: "k1", patientId: "pat-1", sampleId: "s1", outcome: "witnessed", witnessedAt: "t1" });
    p.seedRecord("cycle-1", { riRecordId: "ri-2", oxfordKey: "k2", patientId: "pat-1", sampleId: "s2", outcome: "mismatch", witnessedAt: "t2" });
    const recs = await p.fetchRecordsForCycle("cycle-1");
    expect(recs.map((r) => r.riRecordId)).toEqual(["ri-1", "ri-2"]);
  });

  it("returns an empty list for a cycle with no records", async () => {
    const p = new RiWitnessStubProvider();
    expect(await p.fetchRecordsForCycle("nope")).toEqual([]);
  });

  it("records demographic pushes (Oxford is master)", async () => {
    const p = new RiWitnessStubProvider();
    await p.pushDemographics({ patientId: "pat-1", cycleId: "cycle-1" });
    expect(p.pushedDemographics()).toEqual([{ patientId: "pat-1", cycleId: "cycle-1" }]);
  });

  it("seedMatching mirrors a handling event into an agreeing RI record", async () => {
    const p = new RiWitnessStubProvider();
    const ev: OxfordHandlingEvent = {
      id: asId<"HandlingEvent">("he-1"),
      cycleId: "cycle-1",
      stepKey: "insemination",
      oxfordKey: "k1",
      patientId: "pat-1",
      sampleId: "s1",
      occurredAt: "t0",
      recordedBy: "e1",
    };
    p.seedMatching(ev, "ri-9", "t1");
    const [rec] = await p.fetchRecordsForCycle("cycle-1");
    expect(rec).toMatchObject({ riRecordId: "ri-9", oxfordKey: "k1", patientId: "pat-1", sampleId: "s1", outcome: "witnessed" });
  });
});

describe("InMemoryWitnessingStore", () => {
  it("stores and filters events and reconciliations by cycle", async () => {
    const s = new InMemoryWitnessingStore();
    const ev: OxfordHandlingEvent = {
      id: asId<"HandlingEvent">("he-1"),
      cycleId: "cycle-1",
      stepKey: "insemination",
      oxfordKey: "k1",
      patientId: "pat-1",
      sampleId: "s1",
      occurredAt: "t0",
      recordedBy: "e1",
    };
    await s.saveEvent(ev);
    await s.saveEvent({ ...ev, id: asId<"HandlingEvent">("he-2"), cycleId: "cycle-2" });
    expect(await s.eventsForCycle("cycle-1")).toHaveLength(1);

    const rec: WitnessReconciliation = {
      id: asId<"WitnessReconciliation">("r-1"),
      cycleId: "cycle-1",
      handlingEventId: ev.id,
      oxfordKey: "k1",
      riRecordId: null,
      status: "pending_sync",
      reason: "no_ri_record",
      reconciledAt: "t1",
    };
    await s.saveReconciliation(rec);
    await s.saveReconciliation({ ...rec, id: asId<"WitnessReconciliation">("r-2"), cycleId: "cycle-2" });
    expect(await s.reconciliationsForCycle("cycle-1")).toHaveLength(1);
  });
});
