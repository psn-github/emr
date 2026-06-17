import { describe, expect, it } from "vitest";
import { fixedClock, asId, preconditionFailed, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CycleService } from "./cycle-service.js";
import { InMemoryCycleStore } from "./store.js";
import { InMemoryReasonCodeStore } from "./reason-codes.js";
import { InMemoryCycleTemplateStore } from "./cycle-template.js";
import type { FertilityGate } from "./gate.js";
import type { CycleId } from "./types.js";

const allowGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: true, value: undefined }) };
const denyGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: false, error: preconditionFailed("no verified marriage", "registry.marriage.unverified") }) };

function build(gate: FertilityGate = allowGate, reasons = new InMemoryReasonCodeStore(), templates = new InMemoryCycleTemplateStore()) {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new CycleService(new InMemoryCycleStore(), audit, events, clock, gate, reasons, templates), audit, events };
}

describe("CycleService.createTreatmentCycle", () => {
  it("creates a couple-scoped cycle when the marriage gate allows", async () => {
    const { svc, audit } = build();
    const r = await svc.createTreatmentCycle("doc-1", "icsi", "couple-1", "antagonist");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.owner).toEqual({ kind: "couple", coupleId: "couple-1" });
      expect(r.value.status).toBe("planned");
    }
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
  });

  it("rejects a preservation type through the treatment path", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "fertility_preservation", "couple-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("fertility.preservation_is_person_scoped");
  });

  it("is blocked by the marriage gate", async () => {
    const { svc } = build(denyGate);
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });
});

describe("CycleService.createPreservationCycle", () => {
  it("creates a person-scoped preservation cycle with no couple", async () => {
    const { svc } = build();
    const cycle = await svc.createPreservationCycle("doc-1", "person-1");
    expect(cycle.type).toBe("fertility_preservation");
    expect(cycle.owner).toEqual({ kind: "person", personId: "person-1" });
  });
});

describe("CycleService consent + lifecycle", () => {
  it("blocks leaving planned until consents complete, then advances", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "icsi", "couple-1");
    if (!r.ok) throw new Error("setup");
    const id = r.value.id;

    const blocked = await svc.advanceStatus("doc-1", id, "stimulating");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("fertility.consent.incomplete");

    for (const c of ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]) await svc.recordConsent("doc-1", id, c);
    await svc.recordConsent("doc-1", id, "consent.icsi"); // idempotent re-sign
    const advanced = await svc.advanceStatus("doc-1", id, "stimulating");
    expect(advanced.ok && advanced.value.status).toBe("stimulating");
  });

  it("allows cancelling out of planned without consents", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const cancelled = await svc.advanceStatus("doc-1", r.value.id, "cancelled");
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("rejects illegal transitions and missing cycles", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const bad = await svc.advanceStatus("doc-1", r.value.id, "transfer"); // planned→transfer illegal
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("fertility.bad_transition");
    expect((await svc.advanceStatus("doc-1", asId<"Cycle">("ghost") as CycleId, "stimulating")).ok).toBe(false);
    expect((await svc.recordConsent("doc-1", asId<"Cycle">("ghost") as CycleId, "c")).ok).toBe(false);
    expect((await svc.get(r.value.id)) !== null).toBe(true);
  });

  it("cancels with a CODED reason (+ note) and rejects cancel from a terminal/missing cycle", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const c = await svc.cancel("doc-1", r.value.id, "patient_withdrew", "called in");
    expect(c.ok && c.value.cancellationReasonCode).toBe("patient_withdrew");
    expect(c.ok && c.value.cancellationCategory).toBe("patient_choice");
    expect(c.ok && c.value.cancellationNote).toBe("called in");
    const again = await svc.cancel("doc-1", r.value.id, "patient_withdrew"); // already cancelled → illegal
    expect(again.ok).toBe(false);
    expect((await svc.cancel("doc-1", asId<"Cycle">("ghost") as CycleId, "patient_withdrew")).ok).toBe(false);
  });

  it("rejects an unknown/inactive cancellation reason and a conversion reason via cancel", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    const unknown = await svc.cancel("doc-1", r.value.id, "not_a_code");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.detailKey).toBe("fertility.cancellation.unknown_reason");
    const conv = await svc.cancel("doc-1", r.value.id, "converted_to_iui");
    expect(conv.ok).toBe(false);
    if (!conv.ok) expect(conv.error.detailKey).toBe("fertility.cancellation.use_convert");
  });

  it("rejects an INACTIVE reason on cancel and on convert, and an unknown reason on convert", async () => {
    const reasons = new InMemoryReasonCodeStore([
      { code: "retired", category: "clinical", name: { ar: "ملغى", en: "Retired" }, active: false },
      { code: "retired_conv", category: "converted", name: { ar: "تحويل ملغى", en: "Retired conversion" }, active: false },
    ]);
    const { svc } = build(allowGate, reasons);
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    expect((await svc.cancel("doc-1", r.value.id, "retired")).ok).toBe(false); // inactive → unknown_reason
    expect((await svc.convertCycle("doc-1", r.value.id, "iui", "nope")).ok).toBe(false); // unknown → reason null
    const inactiveConv = await svc.convertCycle("doc-1", r.value.id, "iui", "retired_conv");
    expect(inactiveConv.ok).toBe(false);
    if (!inactiveConv.ok) expect(inactiveConv.error.detailKey).toBe("fertility.cancellation.unknown_reason");
  });

  it("converts a cycle: source cancelled (converted) + new linked cycle created", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    await svc.recordConsent("doc-1", r.value.id, "shared");
    const conv = await svc.convertCycle("doc-1", r.value.id, "iui", "converted_to_iui");
    expect(conv.ok).toBe(true);
    if (!conv.ok) return;
    expect(conv.value.source.status).toBe("cancelled");
    expect(conv.value.source.cancellationCategory).toBe("converted");
    expect(conv.value.created.type).toBe("iui");
    expect(conv.value.created.status).toBe("planned");
    expect(conv.value.created.convertedFromId).toBe(r.value.id);
    expect(conv.value.created.signedConsents).toEqual(["shared"]); // consents carried over
    // disposition: 2 cycles started, 0 true cancellations (the source is a conversion), 1 converted
    const d = await svc.dispositionCounts();
    expect(d).toMatchObject({ started: 2, cancelled: 0, converted: 1 });
  });

  it("rejects illegal conversions (post-retrieval, same type, preservation, bad reason)", async () => {
    const { svc } = build();
    const r = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!r.ok) throw new Error("setup");
    // same type
    expect((await svc.convertCycle("doc-1", r.value.id, "ivf", "converted_to_ivf")).ok).toBe(false);
    // non-conversion reason category
    const badReason = await svc.convertCycle("doc-1", r.value.id, "iui", "patient_withdrew");
    expect(badReason.ok).toBe(false);
    if (!badReason.ok) expect(badReason.error.detailKey).toBe("fertility.convert.reason_not_conversion");
    // to preservation (person-scoped)
    expect((await svc.convertCycle("doc-1", r.value.id, "fertility_preservation", "converted_to_iui")).ok).toBe(false);
    // missing cycle
    expect((await svc.convertCycle("doc-1", asId<"Cycle">("ghost") as CycleId, "iui", "converted_to_iui")).ok).toBe(false);
    // source preservation (person-scoped) cannot be converted
    const preservation = await svc.createPreservationCycle("doc-1", "person-1");
    const fromPres = await svc.convertCycle("doc-1", preservation.id, "iui", "converted_to_iui");
    expect(fromPres.ok).toBe(false);
    if (!fromPres.ok) expect(fromPres.error.detailKey).toBe("fertility.convert.preservation_not_convertible");
    // a cancelled cycle is out of the convertible window
    await svc.cancel("doc-1", r.value.id, "patient_withdrew");
    const notConvertible = await svc.convertCycle("doc-1", r.value.id, "iui", "converted_to_iui");
    expect(notConvertible.ok).toBe(false);
    if (!notConvertible.ok) expect(notConvertible.error.detailKey).toBe("fertility.convert.not_convertible");
  });
});

describe("CycleService cycle templates", () => {
  it("lists templates for a consultant and starts a treatment cycle from one", async () => {
    const { svc } = build();
    expect((await svc.listTemplates("doc-1")).some((t) => t.id === "antagonist_icsi")).toBe(true);
    const r = await svc.createCycleFromTemplate("doc-1", "antagonist_icsi", { kind: "couple", coupleId: "couple-1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.type).toBe("icsi");
      expect(r.value.protocolId).toBe("antagonist"); // template's protocol applied
    }
  });

  it("starts a preservation cycle from a person-scoped template", async () => {
    const { svc } = build();
    const r = await svc.createCycleFromTemplate("doc-1", "mild_preservation", { kind: "person", personId: "person-1" });
    expect(r.ok && r.value.type).toBe("fertility_preservation");
    expect(r.ok && r.value.owner.kind).toBe("person");
  });

  it("respects the marriage gate when a treatment template is used", async () => {
    const { svc } = build(denyGate);
    const r = await svc.createCycleFromTemplate("doc-1", "antagonist_icsi", { kind: "couple", coupleId: "couple-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });

  it("rejects unknown/inactive templates and owner-scope mismatches", async () => {
    const templates = new InMemoryCycleTemplateStore([
      { id: "retired", name: { ar: "ق", en: "Retired" }, cycleType: "ivf", protocolId: null, ownerStaffId: null, active: false },
      { id: "treat", name: { ar: "ع", en: "Treat" }, cycleType: "ivf", protocolId: null, ownerStaffId: null, active: true },
      { id: "preserve", name: { ar: "ح", en: "Preserve" }, cycleType: "fertility_preservation", protocolId: null, ownerStaffId: null, active: true },
    ]);
    const { svc } = build(allowGate, new InMemoryReasonCodeStore(), templates);
    expect((await svc.createCycleFromTemplate("doc-1", "nope", { kind: "couple", coupleId: "c1" })).ok).toBe(false);
    const inactive = await svc.createCycleFromTemplate("doc-1", "retired", { kind: "couple", coupleId: "c1" });
    expect(inactive.ok).toBe(false);
    if (!inactive.ok) expect(inactive.error.detailKey).toBe("fertility.template.unknown");
    // treatment template with a person owner → mismatch
    const wrong1 = await svc.createCycleFromTemplate("doc-1", "treat", { kind: "person", personId: "p1" });
    expect(wrong1.ok).toBe(false);
    if (!wrong1.ok) expect(wrong1.error.detailKey).toBe("fertility.template.owner_mismatch");
    // preservation template with a couple owner → mismatch
    const wrong2 = await svc.createCycleFromTemplate("doc-1", "preserve", { kind: "couple", coupleId: "c1" });
    expect(wrong2.ok).toBe(false);
    if (!wrong2.ok) expect(wrong2.error.detailKey).toBe("fertility.template.owner_mismatch");
    // successful starts from null-protocol templates (treatment + preservation)
    const treat = await svc.createCycleFromTemplate("doc-1", "treat", { kind: "couple", coupleId: "c1" });
    expect(treat.ok && treat.value.protocolId).toBe(null);
    const preserve = await svc.createCycleFromTemplate("doc-1", "preserve", { kind: "person", personId: "p1" });
    expect(preserve.ok && preserve.value.protocolId).toBe(null);
  });
});

describe("CycleService.cohort", () => {
  it("filters by status and creation window (the 'stimulating this week' view)", async () => {
    const { svc } = build();
    const a = await svc.createTreatmentCycle("doc-1", "ivf", "couple-1");
    const b = await svc.createTreatmentCycle("doc-1", "ivf", "couple-2");
    if (!a.ok || !b.ok) throw new Error("setup");
    for (const k of ["consent.ivf", "consent.anaesthesia", "consent.data_processing"]) {
      await svc.recordConsent("doc-1", a.value.id, k);
    }
    await svc.advanceStatus("doc-1", a.value.id, "stimulating");

    const stimulating = await svc.cohort({ status: "stimulating" });
    expect(stimulating.map((c) => c.id)).toEqual([a.value.id]);

    const planned = await svc.cohort({ status: "planned" });
    expect(planned.map((c) => c.id)).toEqual([b.value.id]);

    // window: the fixed clock puts everything on 2026-06-13
    expect((await svc.cohort({ createdAfter: "2026-06-13T00:00:00.000Z", createdBefore: "2026-06-14T00:00:00.000Z" })).length).toBe(2);
    expect((await svc.cohort({ createdAfter: "2026-06-20T00:00:00.000Z" })).length).toBe(0);
  });

  it("surfaces advisory AMH-nomogram counselling and guards bad inputs", () => {
    const { svc } = build();
    const r = svc.amhCounselling(5.0, 41);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category).toBe("high");
      expect(r.value.counsellingFlags).toEqual(["ohss_precaution", "advanced_maternal_age_counselling"]);
    }
    const badAmh = svc.amhCounselling(-1, 30);
    expect(badAmh.ok).toBe(false);
    if (!badAmh.ok) expect(badAmh.error.detailKey).toBe("fertility.amh.bad_value");
    const badAge = svc.amhCounselling(2, 0);
    expect(badAge.ok).toBe(false);
    if (!badAge.ok) expect(badAge.error.detailKey).toBe("fertility.amh.bad_age");
  });
});
