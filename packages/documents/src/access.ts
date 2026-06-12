import type { Result } from "@oxford/core";
import type { AppError } from "@oxford/core";

/**
 * Access enforcement seam. The document store is access-CONTROLLED but stays
 * decoupled from the identity module (platform packages may not depend on domain
 * modules): the caller injects a guard, wired at the API route to the session's
 * Authorizer. A denial is audited by the Authorizer itself (PERMISSION_DENIED).
 */
export interface AccessGuard {
  check(requiredPermission: string): Promise<Result<void, AppError>>;
}

/** A guard that allows everything — for trusted server-side/system contexts only. */
export const allowAllGuard: AccessGuard = {
  check: async () => ({ ok: true, value: undefined }),
};
