import type { Result } from "@oxford/core";
import { ok, err, forbidden } from "@oxford/core";
import type { AuditLog } from "@oxford/audit";
import type { Permission, PermissionDomain } from "./permissions.js";
import { can } from "./rbac.js";
import type { Session } from "./session.js";

/**
 * Default MFA-required domains (ADR-0013): every domain that reads or writes
 * PHI, lab data, money, or staff records. This is a CONFIGURATION VALUE, not
 * hardcoded logic — in production it is sourced from the versioned config table
 * (docs/02 §1, "configuration is data") and passed into the Authorizer. Only the
 * non-PHI `scheduling` domain is absent, so reception/front-desk roles limited
 * to scheduling/check-in may use password + device trust; the instant such a
 * role holds a PHI-domain permission, that action requires MFA.
 */
export const DEFAULT_MFA_REQUIRED_DOMAINS: readonly PermissionDomain[] = [
  "clinical",
  "embryology",
  "financial",
  "hr",
  "admin",
];

export interface AuthorizerOptions {
  /** Domains that require an MFA-satisfied session (docs/02 §2). Configuration,
   *  not code — defaults to DEFAULT_MFA_REQUIRED_DOMAINS. */
  readonly mfaRequiredDomains?: readonly PermissionDomain[];
}

/**
 * The server-side enforcement point. DENY BY DEFAULT: every protected route
 * declares the permission it needs and calls `authorize`. Denials (missing
 * permission OR missing MFA step-up) are written to the audit log.
 */
export class Authorizer {
  private readonly mfaRequired: ReadonlySet<string>;

  constructor(
    private readonly audit: AuditLog,
    options: AuthorizerOptions = {},
  ) {
    this.mfaRequired = new Set(options.mfaRequiredDomains ?? DEFAULT_MFA_REQUIRED_DOMAINS);
  }

  async authorize(
    session: Session,
    required: Permission,
  ): Promise<Result<void, ReturnType<typeof forbidden>>> {
    if (!can(session.subject, required)) {
      return this.deny(session, required, "missing-permission");
    }
    const domain = required.slice(0, required.indexOf(":"));
    if (this.mfaRequired.has(domain) && !session.mfa) {
      return this.deny(session, required, "mfa-required");
    }
    return ok(undefined);
  }

  private async deny(
    session: Session,
    required: Permission,
    reason: "missing-permission" | "mfa-required",
  ): Promise<Result<never, ReturnType<typeof forbidden>>> {
    await this.audit.record({
      actorId: session.subject.staffId,
      entityType: "Permission",
      entityId: required,
      action: "PERMISSION_DENIED",
      after: { required, reason },
    });
    const detailKey = reason === "mfa-required" ? "auth.mfa_required" : "auth.forbidden";
    return err(forbidden(`denied: ${reason}`, detailKey));
  }
}
