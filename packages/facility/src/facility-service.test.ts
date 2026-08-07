import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { FacilityService } from "./facility-service.js";
import { InMemoryFacilityStore } from "./store.js";
import { seedFacility, OXFORD_TOPOLOGY } from "./seed.js";
import type { BedId } from "./types.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new FacilityService(new InMemoryFacilityStore(), audit, events), audit, events, clock };
}

describe("FacilityService.setBedStatus", () => {
  it("transitions a bed, audits it, and emits an event", async () => {
    const { svc, audit, events } = build();
    const loc = await svc.addLocation("L2", "inpatient_bed", { ar: "سرير", en: "Bed" }, 1);
    const bed = await svc.addBed(loc.id, "L2-1");

    const r = await svc.setBedStatus("nurse-1", bed.id, "occupied");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("occupied");

    expect((await audit.entries())[0]!.payload.action).toBe("UPDATE");
    expect((await events.events())[0]!.payload.type).toBe("BedStatusChanged");
  });

  it("rejects an illegal transition", async () => {
    const { svc } = build();
    const loc = await svc.addLocation("L2", "inpatient_bed", { ar: "سرير", en: "Bed" }, 1);
    const bed = await svc.addBed(loc.id, "L2-1"); // starts free
    const r = await svc.setBedStatus("nurse-1", bed.id, "cleaning"); // free→cleaning illegal
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("facility.bed.bad_transition");
  });

  it("reports not-found for an unknown bed", async () => {
    const { svc } = build();
    const r = await svc.setBedStatus("nurse-1", asId<"Bed">("ghost") as BedId, "occupied");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });
});

describe("FacilityService.completeTurnaround", () => {
  it("frees a cleaning bed; lists beds awaiting turnaround; rejects non-cleaning + missing", async () => {
    const { svc } = build();
    const loc = await svc.addLocation("L2", "inpatient_bed", { ar: "سرير", en: "Bed" }, 1);
    const bed = await svc.addBed(loc.id, "L2-1");
    // free → occupied → cleaning
    await svc.setBedStatus("n", bed.id, "occupied");
    await svc.setBedStatus("n", bed.id, "cleaning");
    expect(await svc.bedsAwaitingTurnaround()).toHaveLength(1);

    const done = await svc.completeTurnaround("housekeeping", bed.id);
    expect(done.ok && done.value.status).toBe("free");
    expect(await svc.bedsAwaitingTurnaround()).toHaveLength(0);

    // a free bed can't be "turned around"
    const notCleaning = await svc.completeTurnaround("housekeeping", bed.id);
    expect(notCleaning.ok).toBe(false);
    if (!notCleaning.ok) expect(notCleaning.error.detailKey).toBe("facility.bed.not_cleaning");
    // unknown bed
    expect((await svc.completeTurnaround("housekeeping", "nope" as never)).ok).toBe(false);
  });
});

describe("FacilityService.applyTopology", () => {
  it("is IDEMPOTENT: a second apply creates nothing, audits nothing, and never resets bed status", async () => {
    const { svc, audit, events } = build();
    const first = await svc.applyTopology("ops-1", OXFORD_TOPOLOGY);
    expect(first.created).toEqual({ floors: 4, locations: 19, beds: 9 });
    expect(first.totals).toEqual({ floors: 4, locations: 19, beds: 9 });

    // occupy a bed, then re-apply the very same configuration
    const bed = (await svc.beds())[0]!;
    await svc.setBedStatus("nurse-1", bed.id, "occupied");
    const auditCountBefore = (await audit.entries()).length;

    const second = await svc.applyTopology("ops-1", OXFORD_TOPOLOGY);
    expect(second.created).toEqual({ floors: 0, locations: 0, beds: 0 });
    expect(second.totals).toEqual({ floors: 4, locations: 19, beds: 9 });
    expect(await svc.locations()).toHaveLength(19);
    expect(await svc.beds()).toHaveLength(9);
    // the occupied bed is STILL occupied — re-applying config never frees a bed
    expect((await svc.getBed(bed.id))?.status).toBe("occupied");
    // a no-op apply mutates nothing, so it audits nothing
    expect((await audit.entries()).length).toBe(auditCountBefore);

    const topologyAudits = (await audit.entries()).filter((e) => e.payload.entityType === "FacilityTopology");
    expect(topologyAudits).toHaveLength(1);
    expect(topologyAudits[0]!.payload.action).toBe("CREATE");
    expect((await events.events()).filter((e) => e.payload.type === "FacilityTopologyApplied")).toHaveLength(1);
  });

  it("fills in only what is MISSING from a partially-built facility", async () => {
    const { svc } = build();
    // an operator hand-built one L2 bed with exactly the canonical naming
    const node = await svc.addLocation("L2", "inpatient_bed", { ar: "سرير التنويم 1", en: "Inpatient Bed 1" }, 1);
    await svc.addBed(node.id, "L2-1");

    const r = await svc.applyTopology("ops-1", OXFORD_TOPOLOGY);
    expect(r.created).toEqual({ floors: 4, locations: 18, beds: 8 });
    expect(r.totals).toEqual({ floors: 4, locations: 19, beds: 9 });
    expect(await svc.locations()).toHaveLength(19);
    expect(await svc.beds()).toHaveLength(9);
  });

  it("applies a non-canonical (clinic-specific) spec too — topology is config, not code", async () => {
    const { svc } = build();
    const r = await svc.applyTopology("ops-1", {
      floors: [{ level: "L2", name: { ar: "الطابق الثاني", en: "Level 2" } }],
      locations: [{ level: "L2", type: "inpatient_bed", name: { ar: "جناح", en: "Suite" }, capacity: 2, beds: ["S-1", "S-2"] }],
    });
    expect(r.created).toEqual({ floors: 1, locations: 1, beds: 2 });
    expect((await svc.floors()).map((f) => f.level)).toEqual(["L2"]);
    expect((await svc.beds()).map((b) => b.label).sort()).toEqual(["S-1", "S-2"]);
  });
});

describe("seedFacility", () => {
  it("builds the real four-level layout: 9 beds (3 recovery + 6 inpatient), 19 locations", async () => {
    const { svc } = build();
    const result = await seedFacility(svc);
    expect(result.beds).toBe(9);
    expect(result.locations).toBe(19);
    expect(await svc.beds()).toHaveLength(9);
    const locs = await svc.locations();
    expect(locs.filter((l) => l.type === "theatre")).toHaveLength(2);
    expect(locs.filter((l) => l.type === "recovery_bed")).toHaveLength(3);
    expect(locs.filter((l) => l.type === "inpatient_bed")).toHaveLength(6);
    expect(locs.filter((l) => l.type === "pharmacy")).toHaveLength(1);
    expect(locs.filter((l) => l.type === "lab")).toHaveLength(1);
  });
});
