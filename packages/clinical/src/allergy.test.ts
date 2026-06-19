import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { ClinicalService } from "./clinical-service.js";
import { InMemoryClinicalStore } from "./store.js";
import type { DrugAllergyId } from "./types.js";

// Coded drug-allergy list (docs/01 §E8, ADR-0060). Append-only / soft-delete;
// `allergicClasses` is the read the prescribing advisory consumes.

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new ClinicalService(new InMemoryClinicalStore(), audit, events, clock), audit, events };
}

describe("ClinicalService drug allergies", () => {
  it("records an allergy (audited + event) and lists it for the patient", async () => {
    const { svc, audit, events } = build();
    const a = await svc.recordAllergy("doc-1", "pat-1", { drugClass: "gonadotropin_fsh", substance: { ar: "هرمون", en: "FSH" }, severity: "severe", reaction: "anaphylaxis" });
    expect(a.active).toBe(true);
    const list = await svc.allergiesForPatient("pat-1");
    expect(list.map((x) => x.drugClass)).toEqual(["gonadotropin_fsh"]);
    expect((await audit.entries()).some((e) => e.payload.entityType === "DrugAllergy" && e.payload.action === "CREATE")).toBe(true);
    expect((await events.events()).some((e) => e.payload.type === "DrugAllergyRecorded")).toBe(true);
  });

  it("allergicClasses returns the deduped active class codes only", async () => {
    const { svc } = build();
    await svc.recordAllergy("doc-1", "pat-1", { drugClass: "trigger", substance: { ar: "hCG", en: "hCG" }, severity: "moderate" });
    await svc.recordAllergy("doc-1", "pat-1", { drugClass: "trigger", substance: { ar: "hCG", en: "hCG" }, severity: "mild" });
    await svc.recordAllergy("doc-1", "pat-2", { drugClass: "progesterone", substance: { ar: "P", en: "P" }, severity: "mild" });
    expect(await svc.allergicClasses("pat-1")).toEqual(["trigger"]);
    expect(await svc.allergicClasses("pat-2")).toEqual(["progesterone"]);
    expect(await svc.allergicClasses("pat-3")).toEqual([]);
  });

  it("retire is a soft-delete: retained but no longer matched; double-retire + ghost rejected", async () => {
    const { svc, audit } = build();
    const a = await svc.recordAllergy("doc-1", "pat-1", { drugClass: "estrogen", substance: { ar: "E", en: "E" }, severity: "mild" });
    const retired = await svc.retireAllergy("doc-1", a.id);
    expect(retired.ok).toBe(true);
    expect(await svc.allergicClasses("pat-1")).toEqual([]); // no longer matched
    // still retrievable (append-only — not hard-deleted)
    expect((await svc.retireAllergy("doc-1", a.id)).ok).toBe(false); // already retired
    expect((await svc.retireAllergy("doc-1", asId<"DrugAllergy">("ghost") as DrugAllergyId)).ok).toBe(false);
    expect((await audit.entries()).some((e) => e.payload.entityType === "DrugAllergy" && e.payload.action === "UPDATE")).toBe(true);
  });
});
