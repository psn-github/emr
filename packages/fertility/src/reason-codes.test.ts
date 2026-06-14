import { describe, expect, it } from "vitest";
import { InMemoryReasonCodeStore, SEED_CANCELLATION_REASONS, CONVERSION_CATEGORY } from "./reason-codes.js";

describe("cancellation reason codes (config)", () => {
  it("looks up a seeded code and returns null for an unknown one", async () => {
    const store = new InMemoryReasonCodeStore();
    expect((await store.get("poor_ovarian_response"))?.category).toBe("poor_response");
    expect(await store.get("nope")).toBeNull();
  });

  it("lists only active codes", async () => {
    const store = new InMemoryReasonCodeStore([
      { code: "a", category: "clinical", name: { ar: "أ", en: "A" }, active: true },
      { code: "b", category: "clinical", name: { ar: "ب", en: "B" }, active: false },
    ]);
    expect((await store.listActive()).map((r) => r.code)).toEqual(["a"]);
  });

  it("seed set is bilingual and includes conversion-category reasons", () => {
    expect(SEED_CANCELLATION_REASONS.every((r) => r.name.ar.length > 0 && r.name.en.length > 0)).toBe(true);
    expect(SEED_CANCELLATION_REASONS.some((r) => r.category === CONVERSION_CATEGORY)).toBe(true);
  });
});
