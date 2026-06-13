import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError, preconditionFailed } from "@oxford/core";
import type { DispositionReview, ReviewOutcome } from "./types.js";

// Marital-status-change disposition review (pure, 100%) — AMD-0004 / counsel-
// bounded. A marital-status change (e.g. dissolution) opens a REVIEW of the
// couple's stored specimens; resolution is ALWAYS an explicit human decision
// with a recorded rationale. There is deliberately no path that resolves a
// review automatically, and no outcome that destroys without a reviewed `discard`
// (which itself goes through the witnessed, audited discard). The specific legal
// disposition rule is clinic policy/config — this is only the mechanism.

/** Resolution requires an OPEN review and a non-empty rationale. The outcome is
 *  a typed human decision (`retain` | `discard`); nothing here is automatic. */
export function assertResolveAllowed(review: DispositionReview, rationale: string): Result<void, AppError> {
  if (review.state !== "open") {
    return err(preconditionFailed("disposition review is already resolved", "cryostore.review.already_resolved"));
  }
  if (rationale.trim() === "") {
    return err(validationError("a disposition decision requires a recorded rationale", "cryostore.review.rationale_required"));
  }
  return ok(undefined);
}

/** Does this outcome require the witnessed discard path? (`retain` never does.) */
export function outcomeRequiresDiscard(outcome: ReviewOutcome): boolean {
  return outcome === "discard";
}
