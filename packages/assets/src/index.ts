// @oxford/assets — asset & biomedical-equipment management (docs/01 §E10). Domain
// module: core + audit. Asset register, PPM/calibration scheduling with due-date
// alerting, and a fault/downtime log. The patient-safety control (ADR-0029): a
// CRITICAL asset with overdue/missing calibration is BLOCKED from use via the
// `assertUsable` server-side gate; the blocking set is the per-asset `critical`
// flag (configuration), not code.
export type {
  AssetId,
  MaintenanceId,
  FaultId,
  AssetCategory,
  Asset,
  MaintenanceType,
  MaintenanceRecord,
  FaultSeverity,
  FaultRecord,
} from "./types.js";
export {
  calibrationStatus,
  isDueWithin,
  assetUsability,
  validateMaintenanceDates,
  validateDowntime,
  type CalibrationStatus,
  type AssetUsability,
} from "./calibration.js";
export { type AssetStore, InMemoryAssetStore, latestNextDue } from "./store.js";
export { PgAssetStore } from "./pg-store.js";
export {
  AssetService,
  type RegisterAssetInput,
  type RecordMaintenanceInput,
  type ReportFaultInput,
  type AssetStatus,
  type CalibrationAlert,
  type AssetAlerts,
} from "./asset-service.js";
export { assetsSchema, asset, maintenanceRecord, faultRecord } from "./schema.js";
