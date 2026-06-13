import type { Id } from "@oxford/core";

// Consent-gated partner access (docs/01 §E13, ADR-0042). A patient may grant a
// second person (partner) READ access to their portal data — explicit, revocable,
// and audited. Default is no access (own-data only).

export type PartnerAccessGrantId = Id<"PartnerAccessGrant">;

export interface PartnerAccessGrant {
  readonly id: PartnerAccessGrantId;
  readonly patientId: string;
  readonly partnerId: string;
  readonly grantedAt: string;
  /** Null while active; set when the patient revokes (append-only — never deleted). */
  readonly revokedAt: string | null;
}
