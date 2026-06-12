import type { Result } from "@oxford/core";
import { ok, err, forbidden } from "@oxford/core";
import type { AuditLog } from "@oxford/audit";
import type { Permission, PermissionDomain } from "./permissions.js";
import { can } from "./rbac.js";
import type { Session } from "./session.js";

export interface AuthorizerOptions {
  /** Domains that require an MFA-satisfied session (docs/02 §2). */
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
    this.mfaRequired = new Set(options.mfaRequiredDomains ?? ["clinical", "financial"]);
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
