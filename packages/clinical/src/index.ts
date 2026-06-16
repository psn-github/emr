// @oxford/clinical — clinical EMR core (encounters, append-only versioned notes,
// ordering, results inbox, bilingual letters). Domain module (audit + core).
export type {
  Encounter,
  EncounterId,
  EncounterType,
  EncounterStatus,
  ClinicalNote,
  NoteId,
  NoteVersion,
  Order,
  OrderId,
  OrderKind,
  OrderStatus,
  Result,
  ResultId,
  ResultStatus,
  Letter,
  LetterId,
  LetterStatus,
  OrderSet,
  OrderSetItem,
  Pregnancy,
  PregnancyId,
  PregnancyStatus,
  AntenatalVisit,
  AntenatalVisitId,
} from "./types.js";
export { ClinicalService } from "./clinical-service.js";
export { type ClinicalStore, InMemoryClinicalStore } from "./store.js";
export { PgClinicalStore } from "./pg-store.js";
export { SEED_ORDER_SETS, type OrderSetStore, InMemoryOrderSetStore } from "./order-sets.js";
export { PgOrderSetStore, seedOrderSets } from "./order-sets-pg-store.js";
export { estimateEdd, gestationWeeks, plannedVisits, assessVisit, DEFAULT_VISIT_SCHEDULE_WEEKS, type PlannedVisit, type VisitObservations } from "./antenatal.js";
export { AntenatalService, type BookPregnancyInput, type RecordVisitInput } from "./antenatal-service.js";
export { type AntenatalStore, InMemoryAntenatalStore } from "./antenatal-store.js";
export { PgAntenatalStore } from "./antenatal-pg-store.js";
export { clinicalSchema, encounter, clinicalNote, clinicalOrder, result, letter, orderSet, pregnancy, antenatalVisit } from "./schema.js";
