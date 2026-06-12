import type { Id } from "@oxford/core";
import type { PersonId } from "./person.js";

export type CoupleId = Id<"Couple">;
export type MarriageVerificationId = Id<"MarriageVerification">;

export type CoupleStatus = "pending_verification" | "verified" | "dissolved";

/**
 * The couple — THE fertility clinical unit (docs/03 §1). Husband and wife are
 * explicit, which structurally encodes "own gametes only": the sperm source is
 * the husband and the oocyte source is the wife, BY CONSTRUCTION. There is no
 * donor/surrogate field anywhere — those workflows are structurally absent
 * (ADR-0005), not feature-flagged.
 */
export interface Couple {
  readonly id: CoupleId;
  readonly husbandPersonId: PersonId;
  readonly wifePersonId: PersonId;
  readonly marriageVerificationId: MarriageVerificationId | null;
  readonly status: CoupleStatus;
}
