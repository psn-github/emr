import type { Result } from "@oxford/core";
import { ok, err, preconditionFailed } from "@oxford/core";
import type { Couple, CoupleId, MarriageVerificationId } from "./couple.js";

/** The authoritative marriage-verification record (docs/03 §1). */
export interface MarriageVerification {
  readonly id: MarriageVerificationId;
  readonly coupleId: CoupleId;
  /** Reference to the verified marriage certificate in the document store. */
  readonly documentRef: string;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly method: string;
}

export function isMarriageVerified(couple: Couple): boolean {
  return couple.status === "verified" && couple.marriageVerificationId !== null;
}

/**
 * THE HARD GATE (docs/03 §7 rule 1; CLAUDE.md). No fertility workflow may begin
 * for a couple without a verified marriage record. Enforced server-side: the
 * fertility module calls this before creating any cycle, and the API route
 * cannot bypass it. Returns a precondition error (i18n key
 * "registry.marriage.unverified") rather than throwing.
 */
export function assertMayStartFertility(couple: Couple): Result<void, ReturnType<typeof preconditionFailed>> {
  if (isMarriageVerified(couple)) return ok(undefined);
  return err(
    preconditionFailed(
      "a verified marriage record is required before any fertility workflow",
      "registry.marriage.unverified",
    ),
  );
}
