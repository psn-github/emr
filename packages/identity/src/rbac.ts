import type { Permission } from "./permissions.js";
import { permissionSatisfies } from "./permissions.js";

/** A role is a named bundle of permissions (config data — versioned, editable
 *  by authorised admins without code changes; docs/02 §1). */
export interface Role {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly Permission[];
}

/** The authenticated subject and the roles assigned to them. */
export interface AuthSubject {
  readonly staffId: string;
  readonly roles: readonly Role[];
}

/** Flatten a subject's roles into the set of permissions they hold. */
export function heldPermissions(subject: AuthSubject): readonly Permission[] {
  const set = new Set<Permission>();
  for (const role of subject.roles) {
    for (const p of role.permissions) set.add(p);
  }
  return [...set];
}

/**
 * The authorization decision — DENY BY DEFAULT. Returns true only if some held
 * permission satisfies the required one (exact, domain-wildcard, or super-admin).
 */
export function can(subject: AuthSubject, required: Permission): boolean {
  return heldPermissions(subject).some((held) => permissionSatisfies(held, required));
}
