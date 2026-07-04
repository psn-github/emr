// @oxford/records — paper medical records & filing (ADR-0065). Domain module:
// core + audit. MRN allocation (config format, DB-sequence-backed, unique/
// never-reused, legacy import), the physical file registry (+ volumes; archive
// but never destroy), append-only barcode-keyed movements (check-out/check-in/
// transfer, overdue detection), the day's clinic pull list from scheduling via
// an injected port, and pure deterministic label rendering (Code 128 → SVG,
// bilingual HTML + ZPL). The person is referenced by logical id only.
export type {
  PatientFileId,
  FileMovementId,
  MrnAssignment,
  PatientFile,
  FileStatus,
  MovementKind,
  FileMovement,
  FileWhereabouts,
  AppointmentsPort,
} from "./types.js";
export { type MrnFormat, DEFAULT_MRN_FORMAT, formatMrn, isWellFormedMrn, isImportableMrn } from "./mrn.js";
export { type Code128, type Code128SvgOptions, encodeCode128, code128Svg } from "./code128.js";
export {
  type LabelPatient,
  type IdSheetOptions,
  fileSpineLabel,
  patientIdLabelSheet,
  thermalLabel,
  fileSpineZpl,
  patientIdSheetZpl,
  thermalZpl,
} from "./labels.js";
export { type RecordsStore, InMemoryRecordsStore } from "./store.js";
export { PgRecordsStore } from "./pg-store.js";
export {
  RecordsService,
  deriveState,
  type AssignMrnResult,
  type FileRef,
  type OpenFileInput,
  type AddVolumeInput,
  type CheckOutInput,
  type CheckInInput,
  type TransferInput,
  type OutstandingRow,
  type PullListRow,
} from "./records-service.js";
export { recordsSchema, mrnCounter, mrnAssignment, patientFile, fileMovement } from "./schema.js";
