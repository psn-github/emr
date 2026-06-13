import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { FacilityService } from "./facility-service.js";
import { InMemoryFacilityStore } from "./store.js";
import { seedFacility } from "./seed.js";
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
