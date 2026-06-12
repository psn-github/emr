// Permission model. Deny-by-default: a subject can do nothing unless a role
// grants it. Permissions are namespaced by domain so the domains stay isolated
// (docs/02 §5: "Embryology data, financial data, and HR data are separate
// permission domains").

export const PERMISSION_DOMAINS = [
  "clinical",
  "embryology",
  "financial",
  "hr",
  "admin",
  // Non-PHI front-desk domain (booking, check-in). Reception roles limited to
  // this may authenticate with password + device trust (no MFA). The moment a
  // role is granted any PHI-domain permission (clinical/embryology/financial/
  // hr/admin), MFA is required for those actions — see ADR-0013.
  "scheduling",
] as const;
export type PermissionDomain = (typeof PERMISSION_DOMAINS)[number];

/** A permission is `<domain>:<action>` (e.g. "clinical:note.write") or a
 *  domain wildcard `<domain>:*`. The literal "*:*" is super-admin and must be
 *  granted to essentially no one. */
export type Permission = `${PermissionDomain}:${string}` | "*:*";

export function isPermissionDomain(value: string): value is PermissionDomain {
  return (PERMISSION_DOMAINS as readonly string[]).includes(value);
}

/** Does a held permission satisfy a required one? Supports `<domain>:*` and
 *  global `*:*`. Matching is exact otherwise — no implicit hierarchy. */
export function permissionSatisfies(held: Permission, required: Permission): boolean {
  if (held === required) return true;
  if (held === "*:*") return true;
  const [heldDomain, heldAction] = splitPermission(held);
  const [reqDomain] = splitPermission(required);
  return heldAction === "*" && heldDomain === reqDomain;
}

function splitPermission(p: Permission): [string, string] {
  const idx = p.indexOf(":");
  return [p.slice(0, idx), p.slice(idx + 1)];
}
