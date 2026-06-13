// @oxford/migration — Cliniko cutover tooling (ADR-0017, Option B). Leaf package:
// pure mapping + reconciliation + an idempotency ledger. The orchestration that
// writes into registry/billing lives in the app layer (apps/api).
export type { ClinikoPatient, ClinikoInvoice, ClinikoAppointment, ClinikoExport } from "./source.js";
export {
  activePatients,
  openInvoices,
  mapPatient,
  mapInvoice,
  reconcile,
  type MappedPerson,
  type MappedInvoice,
  type ReconciliationReport,
} from "./map.js";
export { type ImportLedger, InMemoryImportLedger } from "./ledger.js";
export { PgImportLedger } from "./pg-ledger.js";
export { migrationSchema, importLedger } from "./schema.js";
