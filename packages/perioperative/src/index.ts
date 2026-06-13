// @oxford/perioperative — surgical admission + the perioperative journey (docs/01
// §E7). Domain module: core + audit + the facility/flow seam (ADR-0023). Owns the
// SurgicalEncounter and drives every stage transition as an audited bed/floor
// movement; capacity is enforced by the seam. WHO checklist, anaesthesia/intra-op
// records, consumables and the discharge pharmacy gate land in later Phase 3 PRs.
export type { SurgicalEncounterId, JourneyStage, SurgicalEncounter } from "./types.js";
export { canAdvance, assertAdvance, stagePlacement, type CareLocationKind, type StagePlacement } from "./journey.js";
export type { FacilityFlowPort } from "./ports.js";
export { type PerioperativeStore, InMemoryPerioperativeStore } from "./store.js";
export { PgPerioperativeStore } from "./pg-store.js";
export { PerioperativeService, type AdmitInput } from "./perioperative-service.js";
export { perioperativeSchema, surgicalEncounter } from "./schema.js";
