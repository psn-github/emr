// @oxford/embryology — IVF laboratory (docs/01 §E4). Domain module: depends on
// core + audit + the WitnessPort seam (wired to @oxford/witnessing in the app
// layer). The lab never witnesses — RI Witness is authoritative; terminal acts
// (disposition, transfer) are blocked unless the cycle reconciles cleanly.
export type {
  OocyteId,
  InseminationId,
  FertilisationCheckId,
  EmbryoId,
  GradingEntryId,
  DispositionId,
  EmbryoTransferId,
  Maturity,
  InseminationMethod,
  PnStatus,
  DispositionType,
  TransferDifficulty,
  GardnerGrade,
  GardnerLetter,
  Oocyte,
  Insemination,
  FertilisationCheck,
  Embryo,
  GradingEntry,
  Disposition,
  EmbryoTransfer,
  MediaApplicationId,
  MediaApplication,
  PgtOrderId,
  PgtResultId,
  PgtType,
  PgtResultStatus,
  PgtOrder,
  PgtResult,
} from "./types.js";
export { makeGardnerGrade, parseGardnerGrade, formatGardnerGrade } from "./grading.js";
export { isNormalFertilisation, yieldsEmbryo } from "./fertilisation.js";
export { validateMediaApplication, recallReachability, hasValue, type MediaApplicationInput, type RecallReach } from "./media.js";
export { PGT_TYPES, assertPgtIndicationPermitted } from "./pgt.js";
export type { WitnessPort, HandlingEventInput } from "./witness-port.js";
export { type EmbryologyStore, InMemoryEmbryologyStore, type PgtStore, InMemoryPgtStore } from "./store.js";
export { PgEmbryologyStore, PgPgtStore } from "./pg-store.js";
export { PgtService, type OrderPgtInput, type RecordPgtResultInput } from "./pgt-service.js";
export {
  EmbryologyService,
  type RecordOocyteInput,
  type RecordInseminationInput,
  type RecordCheckInput,
  type RecordGradingInput,
  type RecordDispositionInput,
  type RecordTransferInput,
  type CheckResult,
  type EmbryoLifeHistory,
  type LabCounts,
} from "./embryology-service.js";
export {
  embryologySchema,
  oocyte,
  insemination,
  fertilisationCheck,
  embryo,
  gradingEntry,
  disposition,
  embryoTransfer,
  mediaApplication,
  pgtOrder,
  pgtResult,
  qcParameter,
  qcReading,
} from "./schema.js";

// Lab QC log (docs/01 §E5 P1).
export type { LabQcParameter, LabQcReading, LabQcReadingId, LabQcStatus } from "./types.js";
export { SEED_QC_PARAMETERS, evaluateReading, type QcParameterStore, InMemoryQcParameterStore } from "./qc.js";
export { type QcReadingStore, type QcReadingFilter, InMemoryQcReadingStore } from "./qc-store.js";
export { LabQcService, type RecordQcInput } from "./qc-service.js";
export { PgQcParameterStore, PgQcReadingStore, seedQcParameters } from "./qc-pg-store.js";
