// @oxford/consent — consent-gated partner access (docs/01 §E13, ADR-0042). Domain
// module: core + audit. A patient grants another person READ access to their
// portal data (revocable, audited); `mayAccess` is the portal's access gate.
export type { PartnerAccessGrantId, PartnerAccessGrant } from "./types.js";
export { type ConsentStore, InMemoryConsentStore } from "./store.js";
export { PgConsentStore } from "./pg-store.js";
export { ConsentService } from "./consent-service.js";
export { consentSchema, partnerAccessGrant } from "./schema.js";
