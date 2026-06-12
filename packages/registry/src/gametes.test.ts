import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { oocyteSource, spermSource } from "./gametes.js";
import type { Couple } from "./couple.js";

describe("gamete sources — own gametes only, by construction", () => {
  const couple: Couple = {
    id: asId<"Couple">("c1"),
    husbandPersonId: asId<"Person">("husband"),
    wifePersonId: asId<"Person">("wife"),
    marriageVerificationId: null,
    status: "pending_verification",
  };

  it("sperm source is always the husband", () => {
    expect(spermSource(couple)).toBe("husband");
  });

  it("oocyte source is always the wife", () => {
    expect(oocyteSource(couple)).toBe("wife");
  });
});
