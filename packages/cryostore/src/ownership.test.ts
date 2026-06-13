import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { assertThawForTreatmentAllowed, type ThawFacts } from "./ownership.js";
import type { CryoSpecimen, SpecimenKind, SpecimenOwner, SpecimenStatus } from "./types.js";

function specimen(over: { owner: SpecimenOwner; kind?: SpecimenKind; status?: SpecimenStatus }): CryoSpecimen {
  return {
    id: asId<"CryoSpecimen">("spec-1"),
    kind: over.kind ?? "sperm",
    owner: over.owner,
    cycleId: "cycle-1",
    straws: 2,
    position: { tankId: "t1", canister: "c1", cane: "k1", position: "p1" },
    status: over.status ?? "stored",
    freezeEventRef: "fz-1",
    witnessKey: "w-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
const facts = (over: Partial<ThawFacts> = {}): ThawFacts => ({ coupleVerified: true, coupleIncludesOwner: true, ownerAlive: true, ...over });

describe("thaw-for-treatment re-gate", () => {
  it("blocks thawing a specimen that is not in storage", () => {
    const r = assertThawForTreatmentAllowed(specimen({ owner: { kind: "couple", id: "cpl-1" }, status: "thawed" }), "cpl-1", facts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.not_stored");
  });

  describe("couple-owned", () => {
    const s = specimen({ owner: { kind: "couple", id: "cpl-1" }, kind: "embryo" });
    it("allows when the couple is verified and matches", () => {
      expect(assertThawForTreatmentAllowed(s, "cpl-1", facts()).ok).toBe(true);
    });
    it("blocks an unverified couple", () => {
      const r = assertThawForTreatmentAllowed(s, "cpl-1", facts({ coupleVerified: false }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.couple_unverified");
    });
    it("blocks use by a DIFFERENT couple", () => {
      const r = assertThawForTreatmentAllowed(s, "cpl-OTHER", facts());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.couple_mismatch");
    });
  });

  describe("person-owned (preservation)", () => {
    const s = specimen({ owner: { kind: "person", id: "per-1" }, kind: "sperm" });
    it("allows a living owner, verified couple that includes them, own gametes", () => {
      expect(assertThawForTreatmentAllowed(s, "cpl-1", facts()).ok).toBe(true);
    });
    it("BLOCKS posthumous use", () => {
      const r = assertThawForTreatmentAllowed(s, "cpl-1", facts({ ownerAlive: false }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.posthumous_blocked");
    });
    it("blocks a (structurally invalid) person-owned embryo", () => {
      const r = assertThawForTreatmentAllowed(specimen({ owner: { kind: "person", id: "per-1" }, kind: "embryo" }), "cpl-1", facts());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.person_owned_embryo");
    });
    it("blocks an unverified couple", () => {
      const r = assertThawForTreatmentAllowed(s, "cpl-1", facts({ coupleVerified: false }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.couple_unverified");
    });
    it("blocks a couple that does NOT include the owner", () => {
      const r = assertThawForTreatmentAllowed(s, "cpl-1", facts({ coupleIncludesOwner: false }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.owner_not_in_couple");
    });
  });
});
