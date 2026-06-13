import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { reconcileEvent, reconcileCycle, orphanRiRecords, assertSignOffAllowed } from "./reconcile.js";
import type { OxfordHandlingEvent, RiWitnessRecord } from "./types.js";

const AT = "2026-06-22T09:00:00.000Z";

function event(over: Partial<OxfordHandlingEvent> = {}): OxfordHandlingEvent {
  return {
    id: asId<"HandlingEvent">("he-1"),
    cycleId: "cycle-1",
    stepKey: "insemination",
    oxfordKey: "cycle-1:insemination:sample-A",
    patientId: "pat-1",
    sampleId: "sample-A",
    occurredAt: "2026-06-22T08:00:00.000Z",
    recordedBy: "embryologist-1",
    ...over,
  };
}

function ri(over: Partial<RiWitnessRecord> = {}): RiWitnessRecord {
  return {
    riRecordId: "ri-1",
    oxfordKey: "cycle-1:insemination:sample-A",
    patientId: "pat-1",
    sampleId: "sample-A",
    outcome: "witnessed",
    witnessedAt: "2026-06-22T08:00:01.000Z",
    ...over,
  };
}

describe("reconcileEvent", () => {
  it("matches when RI confirms the same patient + sample", () => {
    const r = reconcileEvent(event(), [ri()], AT);
    expect(r.status).toBe("matched");
    expect(r.reason).toBeNull();
    expect(r.riRecordId).toBe("ri-1");
  });

  it("is pending_sync when RI has not returned a record yet", () => {
    const r = reconcileEvent(event(), [], AT);
    expect(r.status).toBe("pending_sync");
    expect(r.reason).toBe("no_ri_record");
    expect(r.riRecordId).toBeNull();
  });

  it("is divergent when RI electronically flagged a mismatch", () => {
    const r = reconcileEvent(event(), [ri({ outcome: "mismatch" })], AT);
    expect(r.status).toBe("divergent");
    expect(r.reason).toBe("ri_flagged_mismatch");
  });

  it("is divergent when RI's patient differs (wrong-patient scenario)", () => {
    const r = reconcileEvent(event(), [ri({ patientId: "pat-999" })], AT);
    expect(r.status).toBe("divergent");
    expect(r.reason).toBe("patient_mismatch");
  });

  it("is divergent when RI's sample differs", () => {
    const r = reconcileEvent(event(), [ri({ sampleId: "sample-Z" })], AT);
    expect(r.status).toBe("divergent");
    expect(r.reason).toBe("sample_mismatch");
  });
});

describe("orphanRiRecords", () => {
  it("flags RI records with no matching Oxford handling event", () => {
    const orphans = orphanRiRecords([event()], [ri(), ri({ riRecordId: "ri-2", oxfordKey: "ghost-key" })]);
    expect(orphans.map((o) => o.riRecordId)).toEqual(["ri-2"]);
  });

  it("returns none when every RI record has a matching event", () => {
    expect(orphanRiRecords([event()], [ri()])).toEqual([]);
  });
});

describe("reconcileCycle", () => {
  it("produces one row per event plus a divergent row per orphan", () => {
    const rows = reconcileCycle([event()], [ri(), ri({ riRecordId: "ri-2", oxfordKey: "ghost-key" })], AT);
    expect(rows).toHaveLength(2);
    const orphan = rows.find((r) => r.reason === "orphan_ri_record")!;
    expect(orphan.status).toBe("divergent");
    expect(orphan.handlingEventId).toBeNull();
    expect(orphan.riRecordId).toBe("ri-2");
  });
});

describe("assertSignOffAllowed", () => {
  it("allows sign-off only when every row is matched", () => {
    const rows = reconcileCycle([event()], [ri()], AT);
    expect(assertSignOffAllowed(rows).ok).toBe(true);
  });

  it("blocks sign-off when any row is pending_sync", () => {
    const rows = reconcileCycle([event()], [], AT);
    const r = assertSignOffAllowed(rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("witnessing.sign_off.blocked");
  });

  it("blocks sign-off when any row is divergent", () => {
    const rows = reconcileCycle([event()], [ri({ patientId: "pat-999" })], AT);
    expect(assertSignOffAllowed(rows).ok).toBe(false);
  });
});
