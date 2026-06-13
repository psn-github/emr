import type { Result, AppError } from "@oxford/core";
import { ok, err, forbidden, preconditionFailed } from "@oxford/core";
import type { CryoSpecimen } from "./types.js";

// THE THAW-FOR-TREATMENT RE-GATE (pure, 100%) — ADR-0015/AMD-0002, docs/01 §E6.
//
// Hard invariant: a person-owned specimen may only be used in treatment after a
// USE-TIME re-gate — a verified couple that INCLUDES that person, using the
// person's OWN gametes — and there is NO posthumous-use pathway. This function
// is the single chokepoint; it takes no "override" and cannot be bypassed.

/** Facts the registry seam supplies at use-time (never trusted from the client). */
export interface ThawFacts {
  /** The couple has a verified marriage record. */
  readonly coupleVerified: boolean;
  /** The verified couple includes the specimen's owner person. */
  readonly coupleIncludesOwner: boolean;
  /** The owner person is living (no posthumous use). */
  readonly ownerAlive: boolean;
}

/**
 * May this stored specimen be thawed for treatment in the given couple?
 * Returns ok only when every gate passes. The order surfaces the most
 * safety-critical failure first (status, then posthumous, then identity).
 */
export function assertThawForTreatmentAllowed(
  specimen: CryoSpecimen,
  coupleId: string,
  facts: ThawFacts,
): Result<void, AppError> {
  if (specimen.status !== "stored") {
    return err(preconditionFailed("specimen is not in storage", "cryostore.thaw.not_stored"));
  }

  if (specimen.owner.kind === "couple") {
    if (!facts.coupleVerified) return err(forbidden("couple marriage not verified", "cryostore.thaw.couple_unverified"));
    if (specimen.owner.id !== coupleId) return err(forbidden("specimen belongs to another couple", "cryostore.thaw.couple_mismatch"));
    return ok(undefined);
  }

  // Person-owned (preservation). Re-gate at use-time.
  if (!facts.ownerAlive) {
    return err(forbidden("no posthumous-use pathway exists", "cryostore.thaw.posthumous_blocked"));
  }
  if (specimen.kind === "embryo") {
    // Embryos are couple-owned by construction; a person-owned embryo is invalid.
    return err(forbidden("a person-owned embryo cannot be used in treatment", "cryostore.thaw.person_owned_embryo"));
  }
  if (!facts.coupleVerified) return err(forbidden("couple marriage not verified", "cryostore.thaw.couple_unverified"));
  if (!facts.coupleIncludesOwner) {
    return err(forbidden("the verified couple does not include the specimen owner", "cryostore.thaw.owner_not_in_couple"));
  }
  return ok(undefined);
}
