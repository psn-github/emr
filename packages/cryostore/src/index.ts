// @oxford/cryostore — cryostorage management (docs/01 §E6; ADR-0015/AMD-0002
// ownership; AMD-0003 billing). Domain module: core + audit + seams (witnessing,
// registry use-gate, billing). The thaw-for-treatment re-gate is the ownership
// invariant; the non-engagement pathway NEVER auto-destroys.
export type {
  CryoSpecimenId,
  CustodyEventId,
  TankId,
  StorageConsentId,
  TankReadingId,
  SpecimenKind,
  SpecimenStatus,
  OwnerKind,
  SpecimenOwner,
  CryoPosition,
  Tank,
  CryoSpecimen,
  CustodyEventType,
  CustodyEvent,
  StorageConsent,
  TankReading,
  EngagementState,
} from "./types.js";
export { assertThawForTreatmentAllowed, type ThawFacts } from "./ownership.js";
export { computeExpiry, isExpired, expiresWithin } from "./storage-period.js";
export { nextEngagementState, type EngagementAction } from "./engagement.js";
export type { WitnessPort, UseGate, BillingPort, HandlingEventInput, StorageChargeLine } from "./ports.js";
export { type CryostoreStore, InMemoryCryostoreStore, positionKey } from "./store.js";
export { PgCryostoreStore } from "./pg-store.js";
export {
  CryostoreService,
  DEFAULT_TANK_THRESHOLDS,
  type FreezeInput,
  type TankThresholds,
  type ReadingResult,
  type SpecimenLocation,
  type ExpiringConsent,
} from "./cryostore-service.js";
export {
  cryostoreSchema,
  tank,
  cryoSpecimen,
  custodyEvent,
  storageConsent,
  tankReading,
  engagement,
} from "./schema.js";
