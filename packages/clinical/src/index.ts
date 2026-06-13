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
} from "./types.js";
export { ClinicalService } from "./clinical-service.js";
export { type ClinicalStore, InMemoryClinicalStore } from "./store.js";
export { PgClinicalStore } from "./pg-store.js";
export { clinicalSchema, encounter, clinicalNote, clinicalOrder, result, letter } from "./schema.js";
