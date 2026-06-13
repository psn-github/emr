import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { assertSetUsable, statusAfterSterilisation } from "./cssd.js";
import { CssdService } from "./cssd-service.js";
import { InMemoryCssdStore } from "./cssd-store.js";

describe("CSSD sterility gate (pure)", () => {
  it("a set is usable only when sterile", () => {
    expect(assertSetUsable("sterile").ok).toBe(true);
    const dirty = assertSetUsable("dirty");
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.error.detailKey).toBe("perioperative.cssd.not_sterile");
    expect(assertSetUsable("used").ok).toBe(false);
  });
  it("status after sterilisation reflects the result", () => {
    expect(statusAfterSterilisation("pass")).toBe("sterile");
    expect(statusAfterSterilisation("fail")).toBe("dirty");
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-22T06:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new CssdService(new InMemoryCssdStore(), audit, events) };
}

describe("CssdService", () => {
  it("a freshly registered set is dirty and cannot be used until sterilised", async () => {
    const { svc } = build();
    const set = await svc.registerSet("tech-1", "Laparoscopy set", ["grasper", "scissors", "trocar"]);
    expect(set.status).toBe("dirty");
    const tooEarly = await svc.useSet("scrub-1", set.id, "enc-1", "2026-06-22T09:00:00Z");
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.detailKey).toBe("perioperative.cssd.not_sterile");
  });

  it("a passing sterilisation makes the set sterile; using it links set→patient→cycle and marks it used", async () => {
    const { svc } = build();
    const set = await svc.registerSet("tech-1", "Hysteroscopy set", ["hysteroscope"]);
    const cycle = await svc.recordSterilisation("tech-1", set.id, { cycleType: "steam_134c", loadRef: "LOAD-1", result: "pass", completedAt: "2026-06-22T06:00:00Z" });
    expect(cycle.ok).toBe(true);

    const used = await svc.useSet("scrub-1", set.id, "enc-1", "2026-06-22T09:00:00Z");
    expect(used.ok).toBe(true);
    if (used.ok && cycle.ok) expect(used.value.sterilisationCycleId).toBe(cycle.value.id);

    // now used → cannot be reused until reprocessed
    expect((await svc.useSet("scrub-1", set.id, "enc-2", "2026-06-22T10:00:00Z")).ok).toBe(false);

    // traceability: the encounter shows which set was used; the set history shows the cycle
    expect(await svc.setsUsedForEncounter("enc-1")).toHaveLength(1);
    const hist = await svc.setHistory(set.id);
    expect(hist.ok && hist.value.cycles).toHaveLength(1);
    if (hist.ok) expect(hist.value.usages).toHaveLength(1);
  });

  it("a failing sterilisation leaves the set dirty (unusable)", async () => {
    const { svc } = build();
    const set = await svc.registerSet("tech-1", "Set", ["x"]);
    await svc.recordSterilisation("tech-1", set.id, { cycleType: "steam", loadRef: "L", result: "fail", completedAt: "z" });
    expect((await svc.useSet("scrub-1", set.id, "enc-1", "z")).ok).toBe(false);
  });

  it("rejects sterilising / using / tracing an unknown set", async () => {
    const { svc } = build();
    expect((await svc.recordSterilisation("t", "nope" as never, { cycleType: "s", loadRef: "L", result: "pass", completedAt: "z" })).ok).toBe(false);
    expect((await svc.useSet("t", "nope" as never, "enc-1", "z")).ok).toBe(false);
    const hist = await svc.setHistory("nope" as never);
    expect(hist.ok).toBe(false);
    if (!hist.ok) expect(hist.error.detailKey).toBe("perioperative.cssd.set_not_found");
  });
});
