import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { StimulationService } from "./stim-service.js";
import { InMemoryStimStore } from "./stim-store.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new StimulationService(new InMemoryStimStore(), audit, events, clock), audit, events };
}

describe("StimulationService.recordDay", () => {
  it("records a day with formulary drug doses, follicles, endo + endocrine", async () => {
    const { svc, audit, events } = build();
    const r = await svc.recordDay("nurse-1", "cycle-1", {
      day: 5,
      drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }, { formularyItemId: "gnrh_antagonist", dose: 0.25, unit: "mg" }],
      follicles: [{ ovary: "left", sizesMm: [12, 14] }, { ovary: "right", sizesMm: [11] }],
      endometriumMm: 8,
      endocrine: { e2: 1200, lh: 3 },
    });
    expect(r.ok).toBe(true);
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("StimDayRecorded");
  });

  it("rejects a non-positive day and propagates drug-validation failures", async () => {
    const { svc } = build();
    const badDay = await svc.recordDay("nurse-1", "cycle-1", { day: 0, drugs: [] });
    expect(badDay.ok).toBe(false);
    if (!badDay.ok) expect(badDay.error.detailKey).toBe("fertility.stim.bad_day");
    const freeText = await svc.recordDay("nurse-1", "cycle-1", { day: 1, drugs: [{ formularyItemId: "homebrew", dose: 100, unit: "IU" }] });
    expect(freeText.ok).toBe(false);
    if (!freeText.ok) expect(freeText.error.detailKey).toBe("fertility.stim.unknown_drug");
  });

  it("builds an ordered chart and upserts the same day", async () => {
    const { svc } = build();
    await svc.recordDay("nurse-1", "cycle-1", { day: 3, drugs: [{ formularyItemId: "rfsh", dose: 150, unit: "IU" }] });
    await svc.recordDay("nurse-1", "cycle-1", { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }] });
    await svc.recordDay("nurse-1", "cycle-1", { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 200, unit: "IU" }] }); // upsert day 1
    const chart = await svc.chart("cycle-1");
    expect(chart.map((d) => d.day)).toEqual([1, 3]);
    expect(chart[0]!.drugs[0]!.dose).toBe(200); // updated, not duplicated
  });

  it("surfaces advisory predictive prompts from the latest charted day", async () => {
    const { svc } = build();
    const none = await svc.predict("cycle-1");
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.detailKey).toBe("fertility.stim.no_days");

    await svc.recordDay("nurse-1", "cycle-1", { day: 6, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }], follicles: [{ ovary: "left", sizesMm: [12, 13] }], endocrine: { e2: 900 } });
    // latest day (8) drives the prompt: 22 follicles + high E2 → high OHSS risk
    await svc.recordDay("nurse-1", "cycle-1", { day: 8, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }], follicles: [{ ovary: "left", sizesMm: Array(22).fill(13) }], endocrine: { e2: 4000 } });
    const p = await svc.predict("cycle-1");
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.ohssRisk).toBe("high");
      expect(p.value.leadFollicleCount).toBe(22);
      expect(p.value.expectedOocyteRange.max).toBeGreaterThan(0);
    }
  });
});
