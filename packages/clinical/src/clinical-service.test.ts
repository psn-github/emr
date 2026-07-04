import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { ClinicalService } from "./clinical-service.js";
import { InMemoryClinicalStore } from "./store.js";
import { InMemoryOrderSetStore } from "./order-sets.js";
import type { EncounterId, LetterId, NoteId, OrderId, ResultId } from "./types.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new ClinicalService(new InMemoryClinicalStore(), audit, events, clock), audit, events };
}

describe("ClinicalService encounters & notes", () => {
  it("opens an encounter and writes a note (audited)", async () => {
    const { svc, audit, events } = build();
    const enc = await svc.openEncounter("doc-1", "pat-1", "new_fertility", "doc-1");
    const note = await svc.writeNote("doc-1", enc.id, "pat-1", { history: "G2P1", plan: "AMH + scan" });
    expect(note.versions).toHaveLength(1);
    expect((await audit.entries()).some((e) => e.payload.entityType === "ClinicalNote")).toBe(true);
    expect((await events.events()).some((e) => e.payload.type === "EncounterOpened")).toBe(true);
  });

  it("amends a note append-only: prior version retained, new version added", async () => {
    const { svc } = build();
    const enc = await svc.openEncounter("doc-1", "pat-1", "follow_up", "doc-1");
    const note = await svc.writeNote("doc-1", enc.id, "pat-1", { plan: "v1 plan" });
    const amended = await svc.amendNote("doc-1", note.id, { plan: "v2 plan" });
    expect(amended.ok).toBe(true);
    if (amended.ok) {
      expect(amended.value.versions.map((v) => v.version)).toEqual([1, 2]);
      expect(amended.value.versions[0]!.body).toEqual({ plan: "v1 plan" }); // original untouched
    }
  });

  it("amendNote / closeEncounter handle not-found and double-close", async () => {
    const { svc } = build();
    expect((await svc.amendNote("doc-1", asId<"ClinicalNote">("ghost") as NoteId, {})).ok).toBe(false);
    expect((await svc.closeEncounter("doc-1", asId<"Encounter">("ghost") as EncounterId)).ok).toBe(false);
    const enc = await svc.openEncounter("doc-1", "pat-1", "gynae", "doc-1");
    expect((await svc.closeEncounter("doc-1", enc.id)).ok).toBe(true);
    const again = await svc.closeEncounter("doc-1", enc.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("clinical.encounter.closed");
  });
});

describe("ClinicalService ordering & results inbox", () => {
  async function ordered() {
    const ctx = build();
    const enc = await ctx.svc.openEncounter("doc-1", "pat-1", "new_fertility", "doc-1");
    const order = await ctx.svc.placeOrder("doc-1", enc.id, "pat-1", "lab", "AMH");
    return { ...ctx, order };
  }

  it("files a result (inbox) and acknowledges it", async () => {
    const { svc, order } = await ordered();
    const r = await svc.fileResult("lab-1", order.id, "AMH 1.2 ng/mL", true);
    expect(r.ok).toBe(true);
    expect(await svc.resultsInbox()).toHaveLength(1);
    if (r.ok) {
      const ack = await svc.acknowledgeResult("doc-1", r.value.id);
      expect(ack.ok && ack.value.status).toBe("acknowledged");
      expect(await svc.resultsInbox()).toHaveLength(0);
    }
  });

  it("releases a result to the patient — invisible until released (ADR-0042)", async () => {
    const { svc, order } = await ordered();
    const r = await svc.fileResult("lab-1", order.id, "AMH 1.2 ng/mL", true);
    if (!r.ok) throw new Error("setup");
    // unreleased → not in the patient's released set
    expect(await svc.releasedResultsForPatient(order.patientId)).toHaveLength(0);
    const rel = await svc.releaseResult("doc-1", r.value.id);
    expect(rel.ok && rel.value.releasedToPatient).toBe(true);
    expect(rel.ok && rel.value.releasedBy).toBe("doc-1");
    const released = await svc.releasedResultsForPatient(order.patientId);
    expect(released).toHaveLength(1);
    expect(released[0]!.id).toBe(r.value.id);
    // double-release + unknown guarded
    const again = await svc.releaseResult("doc-1", r.value.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("clinical.result.released");
    expect((await svc.releaseResult("doc-1", asId<"Result">("ghost") as ResultId)).ok).toBe(false);
  });

  it("handles not-found and double-acknowledge", async () => {
    const { svc, order } = await ordered();
    expect((await svc.fileResult("lab-1", asId<"Order">("ghost") as OrderId, "x", false)).ok).toBe(false);
    expect((await svc.acknowledgeResult("doc-1", asId<"Result">("ghost") as ResultId)).ok).toBe(false);
    const r = await svc.fileResult("lab-1", order.id, "normal", false);
    if (!r.ok) throw new Error("setup");
    await svc.acknowledgeResult("doc-1", r.value.id);
    const again = await svc.acknowledgeResult("doc-1", r.value.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("clinical.result.acknowledged");
  });
});

describe("ClinicalService letters", () => {
  it("drafts and e-signs a bilingual letter", async () => {
    const { svc } = build();
    const letter = await svc.draftLetter("doc-1", "pat-1", "letter.referral", "ar", "نص الخطاب");
    expect(letter.status).toBe("draft");
    const signed = await svc.signLetter("doc-1", letter.id);
    expect(signed.ok && signed.value.status).toBe("signed");
    if (signed.ok) expect(signed.value.signedBy).toBe("doc-1");
  });

  it("reads a letter by id; null for an unknown letter", async () => {
    const { svc } = build();
    const letter = await svc.draftLetter("doc-1", "pat-1", "letter.referral", "en", "body");
    expect((await svc.letter(letter.id))?.templateKey).toBe("letter.referral");
    expect(await svc.letter(asId<"Letter">("ghost") as LetterId)).toBeNull();
  });

  it("rejects signing an unknown or already-signed letter", async () => {
    const { svc } = build();
    expect((await svc.signLetter("doc-1", asId<"Letter">("ghost") as LetterId)).ok).toBe(false);
    const letter = await svc.draftLetter("doc-1", "pat-1", "letter.summary", "en", "body");
    await svc.signLetter("doc-1", letter.id);
    const again = await svc.signLetter("doc-1", letter.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("clinical.letter.signed");
  });
});

describe("ClinicalService clinical pathways / order sets", () => {
  it("lists order sets and applies one, placing all its orders on the encounter", async () => {
    const { svc, events } = build();
    expect((await svc.listOrderSets()).some((s) => s.id === "early_pregnancy")).toBe(true);
    const enc = await svc.openEncounter("doc-1", "pat-1", "antenatal", "doc-1");
    const r = await svc.applyOrderSet("doc-1", enc.id, "pat-1", "early_pregnancy");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((o) => o.code)).toEqual(["BHCG", "PROG", "US_EARLY_VIABILITY"]);
      expect(r.value.every((o) => o.status === "ordered" && o.encounterId === enc.id)).toBe(true);
    }
    const emitted = await events.events();
    expect(emitted.some((e) => e.payload.type === "OrderSetApplied")).toBe(true);
  });

  it("rejects an unknown or inactive order set", async () => {
    const sets = new InMemoryOrderSetStore([
      { id: "retired", name: { ar: "ق", en: "Retired" }, items: [], active: false },
    ]);
    const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
    const svc = new ClinicalService(new InMemoryClinicalStore(), new AuditLog(new InMemoryChainStore<AuditPayload>(), clock), new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock), clock, sets);
    const enc = await svc.openEncounter("doc-1", "pat-1", "gynae", "doc-1");
    const unknown = await svc.applyOrderSet("doc-1", enc.id, "pat-1", "nope");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.detailKey).toBe("clinical.order_set.unknown");
    expect((await svc.applyOrderSet("doc-1", enc.id, "pat-1", "retired")).ok).toBe(false);
  });
});
