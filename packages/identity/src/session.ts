import type { AuthSubject } from "./rbac.js";

/** An authenticated session: who they are, the roles they hold, and whether the
 *  login satisfied MFA. The server is the enforcement point — this is never
 *  trusted from the client. */
export interface Session {
  readonly sessionId: string;
  readonly subject: AuthSubject;
  readonly mfa: boolean;
}

/** Resolves an IdP subject id to the staff member and their assigned roles.
 *  Backed by the role/role_assignment tables (config data). Returns null if the
 *  subject is not a provisioned staff member. */
export type SubjectResolver = (idpSubject: string) => Promise<AuthSubject | null>;
