// @oxford/identity — authentication (OIDC relying party) + deny-by-default RBAC.
// Domain module: depends on @oxford/audit (security events) and @oxford/core.
export {
  PERMISSION_DOMAINS,
  isPermissionDomain,
  permissionSatisfies,
  type PermissionDomain,
  type Permission,
} from "./permissions.js";
export { can, heldPermissions, type Role, type AuthSubject } from "./rbac.js";
export {
  DevOidcProvider,
  claimsHaveMfa,
  type OidcProvider,
  type OidcClaims,
} from "./oidc.js";
export type { Session, SubjectResolver } from "./session.js";
export { AuthService } from "./auth-service.js";
export { Authorizer, type AuthorizerOptions } from "./authorizer.js";
export { identitySchema, staff, role, roleAssignment } from "./schema.js";
