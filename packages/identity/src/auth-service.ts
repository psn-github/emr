import type { Result } from "@oxford/core";
import { ok, err, unauthenticated } from "@oxford/core";
import type { AuditLog } from "@oxford/audit";
import { newId } from "@oxford/core";
import type { OidcProvider } from "./oidc.js";
import { claimsHaveMfa } from "./oidc.js";
import type { Session, SubjectResolver } from "./session.js";

/**
 * Authenticates a bearer token into a Session and writes the security event to
 * the audit log (docs/02 §5: "every login, failed login ... logged immutably").
 * Token verification is delegated to the OIDC provider (ADR-0011); this service
 * maps verified claims to staff/roles and records the outcome.
 */
export class AuthService {
  constructor(
    private readonly oidc: OidcProvider,
    private readonly resolveSubject: SubjectResolver,
    private readonly audit: AuditLog,
  ) {}

  async authenticate(token: string): Promise<Result<Session, ReturnType<typeof unauthenticated>>> {
    const verified = await this.oidc.verifyToken(token);
    if (!verified.ok) {
      await this.audit.record({
        actorId: "unknown",
        entityType: "Session",
        entityId: "unknown",
        action: "LOGIN_FAILED",
        after: { reason: verified.error.detailKey ?? "token-invalid" },
      });
      return verified;
    }

    const subject = await this.resolveSubject(verified.value.sub);
    if (subject === null) {
      await this.audit.record({
        actorId: verified.value.sub,
        entityType: "Session",
        entityId: verified.value.sub,
        action: "LOGIN_FAILED",
        after: { reason: "not-provisioned" },
      });
      return err(unauthenticated("subject is not a provisioned staff member", "auth.not_provisioned"));
    }

    const session: Session = {
      sessionId: newId<"Session">(),
      subject,
      mfa: claimsHaveMfa(verified.value),
    };
    await this.audit.record({
      actorId: subject.staffId,
      entityType: "Session",
      entityId: session.sessionId,
      action: "LOGIN",
      after: { mfa: session.mfa },
    });
    return ok(session);
  }
}
