import { describe, expect, it } from "vitest";
import { InMemoryOrderSetStore, SEED_ORDER_SETS } from "./order-sets.js";

describe("clinical order sets (config)", () => {
  it("looks up a seeded set, returns null for unknown", async () => {
    const store = new InMemoryOrderSetStore();
    expect((await store.get("recurrent_miscarriage_workup"))?.items.length).toBeGreaterThan(0);
    expect(await store.get("nope")).toBeNull();
  });

  it("lists only active sets", async () => {
    const store = new InMemoryOrderSetStore([
      { id: "a", name: { ar: "أ", en: "A" }, items: [], active: true },
      { id: "b", name: { ar: "ب", en: "B" }, items: [], active: false },
    ]);
    expect((await store.listActive()).map((s) => s.id)).toEqual(["a"]);
  });

  it("seed set is bilingual with coded items (no free text)", () => {
    expect(SEED_ORDER_SETS.every((s) => s.name.ar.length > 0 && s.name.en.length > 0)).toBe(true);
    expect(SEED_ORDER_SETS.every((s) => s.items.every((i) => i.code.length > 0 && i.label.ar.length > 0 && i.label.en.length > 0))).toBe(true);
  });
});
