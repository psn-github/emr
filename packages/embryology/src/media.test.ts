import { describe, expect, it } from "vitest";
import { fixedClock, ok, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { EmbryologyService } from "./embryology-service.js";
import { InMemoryEmbryologyStore } from "./store.js";
import type { WitnessPort } from "./witness-port.js";
import { validateMediaApplication, recallReachability, hasValue, type MediaApplicationInput } from "./media.js";
import type { MediaApplication } from "./types.js";

class FakeWitness implements WitnessPort {
  async registerHandlingEvent(): Promise<void> {}
  async assertCycleStepSignOff(): Promise<Result<void, AppError>> {
    return ok(undefined);
  }
}

function build() {
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryEmbryologyStore();
  return { svc: new EmbryologyService(store, new FakeWitness(), audit, events) };
}

const base: MediaApplicationInput = {
  cycleId: "c1",
  embryoId: "e1",
  itemId: "media-1",
  lotNo: "LOT-A",
  step: "fertilisation",
  quantity: 1,
  appliedAt: "2026-06-22T08:00:00Z",
};

describe("media application validation (pure)", () => {
  it("accepts a well-formed application (embryo or oocyte subject)", () => {
    expect(validateMediaApplication(base).ok).toBe(true);
    expect(validateMediaApplication({ ...base, embryoId: undefined, oocyteId: "o1" }).ok).toBe(true);
  });
  it("requires a media item + lot", () => {
    expect(detail(validateMediaApplication({ ...base, itemId: "  " }))).toBe("embryology.media.lot_required");
    expect(detail(validateMediaApplication({ ...base, lotNo: "" }))).toBe("embryology.media.lot_required");
  });
  it("requires a lab step", () => {
    expect(detail(validateMediaApplication({ ...base, step: " " }))).toBe("embryology.media.step_required");
  });
  it("requires a positive whole quantity", () => {
    expect(detail(validateMediaApplication({ ...base, quantity: 0 }))).toBe("embryology.media.quantity_invalid");
    expect(detail(validateMediaApplication({ ...base, quantity: -3 }))).toBe("embryology.media.quantity_invalid");
    expect(detail(validateMediaApplication({ ...base, quantity: 1.5 }))).toBe("embryology.media.quantity_invalid");
  });
  it("requires an embryo or oocyte subject", () => {
    expect(detail(validateMediaApplication({ ...base, embryoId: null, oocyteId: null }))).toBe("embryology.media.subject_required");
    expect(detail(validateMediaApplication({ ...base, embryoId: "", oocyteId: undefined }))).toBe("embryology.media.subject_required");
  });
});

describe("hasValue / recallReachability (pure)", () => {
  it("hasValue treats null/undefined/empty as absent", () => {
    expect(hasValue("x")).toBe(true);
    expect(hasValue("")).toBe(false);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });
  it("dedupes embryos/oocytes/cycles touched by a lot", () => {
    const apps = [
      app({ embryoId: "e1", oocyteId: null, cycleId: "c1" }),
      app({ embryoId: "e1", oocyteId: null, cycleId: "c1" }), // dup embryo+cycle
      app({ embryoId: null, oocyteId: "o9", cycleId: "c2" }),
    ];
    const reach = recallReachability("media-1", "LOT-A", apps);
    expect(reach.applicationCount).toBe(3);
    expect([...reach.embryoIds].sort()).toEqual(["e1"]);
    expect(reach.oocyteIds).toEqual(["o9"]);
    expect([...reach.cycleIds].sort()).toEqual(["c1", "c2"]);
  });
});

describe("EmbryologyService — media traceability + recall", () => {
  it("records applications and a recall reaches every exposed embryo/oocyte/cycle", async () => {
    const { svc } = build();
    const bad = await svc.recordMediaApplication("emb-1", { ...base, quantity: 0 });
    expect(bad.ok).toBe(false); // validation flows through the service

    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-A", embryoId: "embryo-1", itemId: "media-1", lotNo: "LOT-A", step: "culture-d3", quantity: 1, appliedAt: base.appliedAt });
    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-B", oocyteId: "oocyte-9", itemId: "media-1", lotNo: "LOT-A", step: "fertilisation", quantity: 2, appliedAt: base.appliedAt });
    // a different lot must NOT show up in LOT-A's recall
    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-C", embryoId: "embryo-3", itemId: "media-1", lotNo: "LOT-Z", step: "culture-d3", quantity: 1, appliedAt: base.appliedAt });

    const recall = await svc.mediaRecall("media-1", "LOT-A");
    expect(recall.applicationCount).toBe(2);
    expect([...recall.embryoIds]).toEqual(["embryo-1"]);
    expect([...recall.oocyteIds]).toEqual(["oocyte-9"]);
    expect([...recall.cycleIds].sort()).toEqual(["cycle-A", "cycle-B"]);
    expect((await svc.mediaRecall("media-1", "LOT-Z")).cycleIds).toEqual(["cycle-C"]);
  });

  it("life history includes media applied to the embryo AND to its originating oocyte", async () => {
    const { svc } = build();
    const o = await svc.recordOocyte("emb-1", { cycleId: "cycle-LH", retrievalProcedureId: "p1", maturity: "MII", dish: "D1", position: "A1" });
    const check = await svc.recordFertilisationCheck("emb-1", { cycleId: "cycle-LH", oocyteId: o.id, pn: "2PN", checkedAt: base.appliedAt });
    const embryoId = check.embryo!.id;
    // media on the oocyte (pre-embryo) and later on the embryo itself
    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-LH", oocyteId: o.id, itemId: "media-1", lotNo: "LOT-A", step: "fertilisation", quantity: 1, appliedAt: base.appliedAt });
    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-LH", embryoId, itemId: "media-2", lotNo: "LOT-B", step: "culture-d3", quantity: 1, appliedAt: base.appliedAt });
    // unrelated application in the same cycle (different oocyte, no embryo) is excluded
    await svc.recordMediaApplication("emb-1", { cycleId: "cycle-LH", oocyteId: "other-oocyte", itemId: "media-3", lotNo: "LOT-C", step: "fertilisation", quantity: 1, appliedAt: base.appliedAt });

    const hist = await svc.embryoLifeHistory(embryoId);
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      expect(hist.value.media.map((m) => m.lotNo).sort()).toEqual(["LOT-A", "LOT-B"]);
    }
  });
});

function detail(r: Result<unknown, AppError>): string | undefined {
  return r.ok ? undefined : r.error.detailKey;
}
function app(p: { embryoId: string | null; oocyteId: string | null; cycleId: string }): MediaApplication {
  return { id: "m" as MediaApplication["id"], cycleId: p.cycleId, embryoId: p.embryoId as MediaApplication["embryoId"], oocyteId: p.oocyteId as MediaApplication["oocyteId"], itemId: "media-1", lotNo: "LOT-A", step: "s", quantity: 1, appliedAt: base.appliedAt, operator: "emb-1" };
}
