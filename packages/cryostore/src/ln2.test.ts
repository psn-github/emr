import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CryostoreService } from "./cryostore-service.js";
import { InMemoryCryostoreStore } from "./store.js";
import type { WitnessPort, UseGate, BillingPort, AssetPpmPort } from "./ports.js";
import type { ThawFacts } from "./ownership.js";
import type { SpecimenOwner } from "./types.js";

const noWitness: WitnessPort = { async registerHandlingEvent() {} };
const noGate: UseGate = { async thawFacts(_o: SpecimenOwner, _c: string): Promise<ThawFacts> { return { coupleVerified: true, coupleIncludesOwner: true, ownerAlive: true }; } };
const noBilling: BillingPort = { async raiseStorageCharge() { return "inv-1"; } };

function build(assetPpm?: AssetPpmPort) {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const svc = new CryostoreService(new InMemoryCryostoreStore(), noWitness, noGate, noBilling, audit, events, clock, assetPpm);
  return { svc, events };
}

describe("cryostore — LN₂ consumption", () => {
  it("records fills and sums consumption over a window", async () => {
    const { svc, events } = build();
    const tank = await svc.registerTank("eng-1", "Tank A");
    expect(tank.assetRef).toBe(null);

    const r1 = await svc.recordLnFill("eng-1", tank.id, 12.5, "2026-06-05T08:00:00.000Z");
    expect(r1.ok).toBe(true);
    await svc.recordLnFill("eng-1", tank.id, 10, "2026-06-12T08:00:00.000Z");
    await svc.recordLnFill("eng-1", tank.id, 99, "2026-07-01T08:00:00.000Z"); // outside window

    const usage = await svc.lnConsumption(tank.id, "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.000Z");
    expect(usage).toEqual({ tankId: tank.id, since: "2026-06-01T00:00:00.000Z", until: "2026-06-30T23:59:59.000Z", litres: 22.5, fills: 2 });
    expect((await events.events()).some((e) => e.payload.type === "LnFillRecorded")).toBe(true);
  });

  it("rejects non-positive litres and an unknown tank", async () => {
    const { svc } = build();
    const tank = await svc.registerTank("eng-1", "Tank A");
    const bad = await svc.recordLnFill("eng-1", tank.id, 0, "2026-06-05T08:00:00.000Z");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("cryostore.ln_fill.bad_litres");
    const noTank = await svc.recordLnFill("eng-1", "ghost", 5, "2026-06-05T08:00:00.000Z");
    expect(noTank.ok).toBe(false);
    if (!noTank.ok) expect(noTank.error.detailKey).toBe("cryostore.tank.not_found");
  });
});

describe("cryostore — tank PPM linkage to asset module", () => {
  it("resolves PPM status from the linked asset via the port", async () => {
    const ppm: AssetPpmPort = { async ppmStatus(ref) { return ref === "asset-1" ? { nextDueDate: "2026-06-01T00:00:00.000Z", overdue: true } : null; } };
    const { svc } = build(ppm);
    const tank = await svc.registerTank("eng-1", "Tank A", "asset-1");
    expect(tank.assetRef).toBe("asset-1");

    const status = await svc.tankPpmStatus(tank.id);
    expect(status.ok && status.value).toEqual({ tankId: tank.id, assetRef: "asset-1", nextDueDate: "2026-06-01T00:00:00.000Z", overdue: true });
  });

  it("returns empty PPM for an unlinked tank, and not-found for an unknown tank", async () => {
    const { svc } = build();
    const tank = await svc.registerTank("eng-1", "Tank A");
    const unlinked = await svc.tankPpmStatus(tank.id);
    expect(unlinked.ok && unlinked.value).toEqual({ tankId: tank.id, assetRef: null, nextDueDate: null, overdue: false });

    const missing = await svc.tankPpmStatus("ghost");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("cryostore.tank.not_found");
  });

  it("defaults to no-asset PPM when no port is wired (linked asset returns null)", async () => {
    const { svc } = build(); // default no-op port returns null
    const tank = await svc.registerTank("eng-1", "Tank A", "asset-x");
    const status = await svc.tankPpmStatus(tank.id);
    expect(status.ok && status.value).toEqual({ tankId: tank.id, assetRef: "asset-x", nextDueDate: null, overdue: false });
  });
});
