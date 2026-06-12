import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { assertMayStartFertility, isMarriageVerified } from "./marriage.js";
import type { Couple } from "./couple.js";

const baseCouple: Couple = {
  id: asId<"Couple">("c1"),
  husbandPersonId: asId<"Person">("h"),
  wifePersonId: asId<"Person">("w"),
  marriageVerificationId: null,
  status: "pending_verification",
};

describe("isMarriageVerified", () => {
  it("is true only when status is verified AND a verification id is present", () => {
    expect(isMarriageVerified({ ...baseCouple, status: "verified", marriageVerificationId: asId<"MarriageVerification">("m") })).toBe(true);
    expect(isMarriageVerified({ ...baseCouple, status: "verified", marriageVerificationId: null })).toBe(false);
    expect(isMarriageVerified(baseCouple)).toBe(false);
  });
});

describe("assertMayStartFertility — THE HARD GATE", () => {
  it("blocks an unverified couple with the i18n key", () => {
    const r = assertMayStartFertility(baseCouple);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });

  it("allows a verified couple", () => {
    const verified: Couple = { ...baseCouple, status: "verified", marriageVerificationId: asId<"MarriageVerification">("m") };
    expect(assertMayStartFertility(verified).ok).toBe(true);
  });
});
