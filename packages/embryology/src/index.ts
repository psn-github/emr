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
} from "./types.js";
export { makeGardnerGrade, parseGardnerGrade, formatGardnerGrade } from "./grading.js";
export { isNormalFertilisation, yieldsEmbryo } from "./fertilisation.js";
export type { WitnessPort, HandlingEventInput } from "./witness-port.js";
export { type EmbryologyStore, InMemoryEmbryologyStore } from "./store.js";
export { PgEmbryologyStore } from "./pg-store.js";
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
} from "./schema.js";
