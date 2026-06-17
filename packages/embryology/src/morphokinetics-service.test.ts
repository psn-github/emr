import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { MorphokineticsService, type EmbryoLookup } from "./morphokinetics-service.js";
import { InMemoryMorphokineticRangeStore } from "./morphokinetics.js";
import { InMemoryMorphokineticAnnotationStore } from "./morphokinetics-store.js";
import type { Embryo, EmbryoId } from "./types.js";

const EMBRYO = asId<"Embryo">("emb-1");

const lookup = (ids: readonly string[]): EmbryoLookup => ({
  async embryoById(id: EmbryoId): Promise<Embryo | undefined> {
    return ids.includes(id) ? { id, cycleId: "cyc-1", oocyteId: asId<"Oocyte">("ooc-1"), createdAt: "2026-06-10T00:00:00.000Z" } : undefined;
  },
});

function build(embryoIds: readonly string[] = [EMBRYO]) {
  const clock = fixedClock(new Date("2026-06-14T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const svc = new MorphokineticsService(lookup(embryoIds), new InMemoryMorphokineticRangeStore(), new InMemoryMorphokineticAnnotationStore(), audit, events);
  return { svc, events };
}

describe("MorphokineticsService", () => {
  it("records an annotation with derived intervals + an optimal-range score", async () => {
    const { svc, events } = build();
    expect((await svc.listRanges()).length).toBeGreaterThan(0);
    const r = await svc.recordAnnotation("embryologist-1", { embryoId: EMBRYO, source: "EmbryoScope", events: { t2: 26, t3: 37, t4: 40, t5: 50 }, annotatedAt: "2026-06-14T08:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.score).toBe(6);
      expect(r.value.intervals.cc2).toBe(11);
      expect(r.value.flags).toEqual([]);
    }
    expect(await svc.annotationsForEmbryo(EMBRYO)).toHaveLength(1);
    const emitted = await events.events();
    expect(emitted.some((e) => e.payload.type === "MorphokineticAnnotationRecorded")).toBe(true);
  });

  it("flags direct cleavage and emits a flagged event", async () => {
    const { svc, events } = build();
    const r = await svc.recordAnnotation("embryologist-1", { embryoId: EMBRYO, source: "Geri", events: { t2: 24, t3: 27 }, annotatedAt: "2026-06-14T08:00:00.000Z", note: "review" });
    expect(r.ok && r.value.flags).toContain("direct_cleavage");
    expect(r.ok && r.value.note).toBe("review");
    expect((await events.events()).some((e) => e.payload.type === "MorphokineticFlagged")).toBe(true);
  });

  it("rejects an unknown embryo and out-of-order timings", async () => {
    const { svc } = build();
    const noEmbryo = await svc.recordAnnotation("e-1", { embryoId: "ghost", source: "EmbryoScope", events: { t2: 26 }, annotatedAt: "2026-06-14T08:00:00.000Z" });
    expect(noEmbryo.ok).toBe(false);
    if (!noEmbryo.ok) expect(noEmbryo.error.detailKey).toBe("embryology.morphokinetics.embryo_not_found");

    const badOrder = await svc.recordAnnotation("e-1", { embryoId: EMBRYO, source: "EmbryoScope", events: { t2: 30, t3: 28 }, annotatedAt: "2026-06-14T08:00:00.000Z" });
    expect(badOrder.ok).toBe(false);
    if (!badOrder.ok) expect(badOrder.error.detailKey).toBe("embryology.morphokinetics.out_of_order");
  });
});
