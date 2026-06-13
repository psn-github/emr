// @oxford/perioperative — surgical admission + the perioperative journey (docs/01
// §E7). Domain module: core + audit + the facility/flow seam (ADR-0023). Owns the
// SurgicalEncounter and drives every stage transition as an audited bed/floor
// movement; capacity is enforced by the seam. WHO checklist, anaesthesia/intra-op
// records, consumables and the discharge pharmacy gate land in later Phase 3 PRs.
export type { SurgicalEncounterId, JourneyStage, SurgicalEncounter, TheatreCaseId, TheatreCaseStatus, TheatreCase, PreOpAssessmentId, PreOpAssessment } from "./types.js";
export { canAdvance, assertAdvance, stagePlacement, type CareLocationKind, type StagePlacement } from "./journey.js";
export { validatePreOp, type PreOpInput } from "./preop.js";
export { ANAESTHESIA_FORMULARY, validateDrugAdministration, type FormularyDrug, type AnaesthesiaUnit, type DrugAdministrationInput } from "./anaesthesia.js";
export { validateConsumableUse, lineTotalFils, type ConsumableUseInput } from "./consumables.js";
export { bedReservationStatus, type BedReservationStatus } from "./bed-reservation.js";
export {
  WHO_REQUIRED_ITEMS,
  phaseComplete,
  assertMayEnterTheatre,
  assertMayLeaveTheatre,
  type WhoPhase,
  type WhoChecklist,
  type PhaseRecord,
} from "./who-checklist.js";
export type {
  FacilityFlowPort,
  SchedulingPort,
  BookTheatreSlotInput,
  ChecklistGate,
  InventoryPort,
  InventoryDeductItem,
  PerioperativeBillingPort,
  ConsumableChargeLine,
} from "./ports.js";
export type { IntraOpRecordId, IntraOpRecord, ConsumableUseId, ConsumableUse, SpecimenRecordId, SpecimenRecord, DrugAdministration } from "./types.js";
export { type IntraOpStore, InMemoryIntraOpStore } from "./intraop-store.js";
export { PgIntraOpStore } from "./intraop-pg-store.js";
export { IntraOpService, type RecordIntraOpInput, type RecordSpecimenInput, type ConsumablesResult } from "./intraop-service.js";
export { type WhoChecklistStore, InMemoryWhoChecklistStore } from "./who-store.js";
export { PgWhoChecklistStore } from "./who-pg-store.js";
export { WhoChecklistService } from "./who-service.js";
export { type PerioperativeStore, InMemoryPerioperativeStore } from "./store.js";
export { PgPerioperativeStore } from "./pg-store.js";
export { type TheatreCaseStore, InMemoryTheatreCaseStore } from "./theatre-store.js";
export { PgTheatreCaseStore } from "./theatre-pg-store.js";
export { PerioperativeService, type AdmitInput } from "./perioperative-service.js";
export { TheatreSchedulingService, type ScheduleCaseInput, type ScheduleCaseResult } from "./theatre-scheduling-service.js";
export { type PreOpStore, InMemoryPreOpStore } from "./preop-store.js";
export { PgPreOpStore } from "./preop-pg-store.js";
export { PreOpService, type RecordPreOpInput } from "./preop-service.js";
export { perioperativeSchema, surgicalEncounter, theatreCase, preOpAssessment, whoChecklist, intraOpRecord, consumableUse, specimenRecord } from "./schema.js";
