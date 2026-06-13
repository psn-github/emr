// @oxford/fertility — cycle engine + protocol library + consent gating. Domain
// module (audit + core). The marriage hard-gate is enforced via the injected
// FertilityGate seam (wired to registry in the app layer).
export type { Cycle, CycleId, CycleType, CycleStatus, CycleOwner, Protocol } from "./types.js";
export { PERSON_SCOPED_TYPES } from "./types.js";
export { canAdvance, assertAdvance } from "./lifecycle.js";
export { requiredConsents, assertConsentsComplete } from "./consent.js";
export type { FertilityGate } from "./gate.js";
export { SEED_PROTOCOLS } from "./protocols.js";
export { CycleService } from "./cycle-service.js";
export { type CycleStore, InMemoryCycleStore } from "./store.js";
export { PgCycleStore } from "./pg-store.js";
export { fertilitySchema, cycle, protocol, stimDay } from "./schema.js";

// Stimulation charting + controlled formulary (dose entry validated; the
// om-software dosing calculator is a follow-on — pending om-software access).
export {
  STIM_FORMULARY,
  formularyItem,
  type FormularyItem,
  type DrugClass,
  type DoseUnit,
} from "./formulary.js";
export { validateDrugDose, type DrugDoseInput } from "./stim-validate.js";
export type {
  StimulationDay,
  StimulationDayId,
  FollicleMeasurement,
  Endocrine,
  RecordDayInput,
} from "./stimulation.js";
export { StimulationService } from "./stim-service.js";
export { type StimStore, InMemoryStimStore } from "./stim-store.js";
export { PgStimStore } from "./stim-pg-store.js";

// Monitoring-visit workflow + trigger calculator + procedures.
export { computeRetrievalTime, countdownHours, DEFAULT_TRIGGER_TO_RETRIEVAL_HOURS } from "./trigger.js";
export type { MonitoringVisit, MonitoringVisitId, MonitoringDecision, Procedure, ProcedureId, ProcedureType } from "./monitoring.js";
export { MonitoringService, type RecordVisitInput, type VisitResult } from "./monitoring-service.js";
export { type MonitoringStore, InMemoryMonitoringStore } from "./monitoring-store.js";
export { PgMonitoringStore } from "./monitoring-pg-store.js";
export { monitoringVisit, procedure } from "./schema.js";
