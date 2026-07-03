import type { AuthSubject, Permission, Role, SubjectResolver } from "@oxford/identity";

// DEV/STAGING staff directory (synthetic identities only). Until real staff
// provisioning is wired (identity tables + the in-region OIDC provider,
// ADR-0011/ADR-0062), the HTTP host resolves IdP subjects against this fixed,
// deny-by-default directory. It mirrors the role shapes the e2e suite proves
// against the Authorizer, and it can never be the relying party for real PHI:
// the constructor refuses production, exactly like DevOidcProvider and
// LocalKeyProvider (ADR-0012).

const role = (id: string, permissions: readonly Permission[]): Role => ({ id, name: id, permissions: [...permissions] });

/** The synthetic staging staff. Subjects are the `sub` claim of a dev token. */
const DIRECTORY: Readonly<Record<string, AuthSubject>> = {
  "dev-consultant": {
    staffId: "doc-1",
    roles: [role("consultant", ["clinical:*", "scheduling:*"])],
  },
  "dev-nurse": {
    staffId: "nurse-1",
    roles: [role("nurse", ["clinical:encounter.write", "clinical:note.write", "clinical:order.write", "scheduling:*"])],
  },
  "dev-embryologist": {
    staffId: "emb-1",
    roles: [role("embryologist", ["embryology:*"])],
  },
  "dev-reception": {
    staffId: "rec-1",
    roles: [role("reception", ["scheduling:*"])],
  },
  "dev-finance": {
    staffId: "fin-1",
    roles: [role("finance", ["financial:*"])],
  },
  "dev-ops": {
    staffId: "ops-1",
    roles: [role("ops-admin", ["admin:*", "hr:*"])],
  },
  // Records/filing officer (ADR-0065): the paper-file desk. Scoped to the
  // records surface only — MFA-gated clinical domain, no wider clinical access.
  "dev-records": {
    staffId: "rec-files-1",
    roles: [role("records-officer", ["clinical:records.read", "clinical:records.write"])],
  },
  // Ground-floor pharmacist (ADR-0066): dispenses only. Prescribing is a
  // clinician action (dev-consultant's clinical:* already covers it) — the
  // pharmacist is deliberately NOT granted clinical:prescription.write.
  "dev-pharmacist": {
    staffId: "phm-1",
    roles: [role("pharmacist", ["clinical:dispense.read", "clinical:dispense.write"])],
  },
};

/** Deny-by-default resolver over the fixed staging directory. */
export function devStaffDirectory(isProduction: boolean): SubjectResolver {
  if (isProduction) {
    throw new Error("devStaffDirectory must never run in production — wire the identity tables + real OIDC");
  }
  return async (idpSubject: string) => DIRECTORY[idpSubject] ?? null;
}

/** The subjects the staging directory provisions (used by the simulator). */
export const DEV_SUBJECTS = Object.keys(DIRECTORY);
