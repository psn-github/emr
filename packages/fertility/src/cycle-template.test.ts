import { describe, expect, it } from "vitest";
import { InMemoryCycleTemplateStore, SEED_CYCLE_TEMPLATES } from "./cycle-template.js";

describe("cycle templates (config)", () => {
  it("looks up a seeded template, returns null for unknown", async () => {
    const store = new InMemoryCycleTemplateStore();
    expect((await store.get("antagonist_icsi"))?.cycleType).toBe("icsi");
    expect(await store.get("nope")).toBeNull();
  });

  it("lists a consultant's own + clinic-wide active templates, excluding others/inactive", async () => {
    const store = new InMemoryCycleTemplateStore([
      { id: "shared", name: { ar: "م", en: "Shared" }, cycleType: "ivf", protocolId: "antagonist", ownerStaffId: null, active: true },
      { id: "mine", name: { ar: "ل", en: "Mine" }, cycleType: "icsi", protocolId: null, ownerStaffId: "doc-1", active: true },
      { id: "theirs", name: { ar: "غ", en: "Theirs" }, cycleType: "ivf", protocolId: null, ownerStaffId: "doc-2", active: true },
      { id: "retired", name: { ar: "ق", en: "Retired" }, cycleType: "ivf", protocolId: null, ownerStaffId: null, active: false },
    ]);
    expect((await store.listFor("doc-1")).map((t) => t.id).sort()).toEqual(["mine", "shared"]);
  });

  it("seed set is bilingual and references seeded protocols", () => {
    expect(SEED_CYCLE_TEMPLATES.every((t) => t.name.ar.length > 0 && t.name.en.length > 0)).toBe(true);
    expect(SEED_CYCLE_TEMPLATES.some((t) => t.cycleType === "fertility_preservation")).toBe(true);
  });
});
