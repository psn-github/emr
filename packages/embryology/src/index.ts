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
  PgtOrderId,
  PgtResultId,
  PgtType,
  PgtResultStatus,
  PgtOrder,
  PgtResult,
} from "./types.js";
export { makeGardnerGrade, parseGardnerGrade, formatGardnerGrade } from "./grading.js";
export { isNormalFertilisation, yieldsEmbryo } from "./fertilisation.js";
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
  pgtOrder,
  pgtResult,
} from "./schema.js";
