import { describe, expect, it } from "vitest";
import { assertConsentsComplete, requiredConsents } from "./consent.js";

describe("per-cycle consent gating", () => {
  it("lists required consents per type", () => {
    expect(requiredConsents("icsi")).toContain("consent.icsi");
    expect(requiredConsents("fertility_preservation")).toContain("consent.storage");
  });
  it("blocks until every required consent is signed", () => {
    const incomplete = assertConsentsComplete("icsi", ["consent.icsi"]);
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error.detailKey).toBe("fertility.consent.incomplete");
    expect(assertConsentsComplete("icsi", ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]).ok).toBe(true);
  });
});
