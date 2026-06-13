import { describe, expect, it } from "vitest";
import { assertAdvance, canAdvance } from "./lifecycle.js";

describe("cycle lifecycle", () => {
  it("allows the treatment path and the preservation shortcut (retrieval→outcome)", () => {
    expect(canAdvance("planned", "stimulating")).toBe(true);
    expect(canAdvance("retrieval", "fertilisation")).toBe(true);
    expect(canAdvance("retrieval", "outcome")).toBe(true); // preservation: freeze → outcome
    expect(canAdvance("transfer", "luteal")).toBe(true);
    expect(canAdvance("planned", "cancelled")).toBe(true);
  });
  it("rejects illegal jumps and moves out of terminal states", () => {
    expect(canAdvance("planned", "retrieval")).toBe(false);
    expect(canAdvance("outcome", "luteal")).toBe(false);
    expect(canAdvance("cancelled", "planned")).toBe(false);
  });
  it("assertAdvance surfaces the i18n key", () => {
    expect(assertAdvance("planned", "stimulating").ok).toBe(true);
    const bad = assertAdvance("planned", "outcome");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("fertility.bad_transition");
  });
});
