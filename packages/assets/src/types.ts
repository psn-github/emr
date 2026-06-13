import type { Id } from "@oxford/core";

// Asset & biomedical-equipment management types (docs/01 §E10). Durable equipment
// (incubators, scanners, lasers, theatre kit, cryotanks, analysers) with PPM /
// calibration schedules and fault/downtime logging. A per-asset `critical` flag
// drives the use-blocking gate (ADR-0029) — configuration, not code.

export type AssetId = Id<"Asset">;
export type MaintenanceId = Id<"Maintenance">;
export type FaultId = Id<"Fault">;

export type AssetCategory =
  | "incubator"
  | "scanner"
  | "laser"
  | "theatre_equipment"
  | "cryotank"
  | "analyser"
  | "other";

export interface Asset {
  readonly id: AssetId;
  readonly name: string;
  readonly category: AssetCategory;
  readonly locationId: string;
  readonly serialNumber: string;
  readonly supplierId: string | null;
  readonly warrantyExpiry: string | null;
  /** Critical equipment — overdue/missing calibration BLOCKS use (ADR-0029). */
  readonly critical: boolean;
  readonly status: "active" | "retired";
}

export type MaintenanceType = "ppm" | "calibration" | "service";

/** A completed PPM / calibration / service event, recording the next due date. */
export interface MaintenanceRecord {
  readonly id: MaintenanceId;
  readonly assetId: string;
  readonly type: MaintenanceType;
  readonly performedAt: string;
  readonly performedBy: string;
  /** When the next of this maintenance type is due (null for ad-hoc service). */
  readonly nextDueDate: string | null;
  readonly notes: string;
}

export type FaultSeverity = "minor" | "major" | "critical";

/** Fault/incident log with downtime tracking. */
export interface FaultRecord {
  readonly id: FaultId;
  readonly assetId: string;
  readonly reportedAt: string;
  readonly reportedBy: string;
  readonly description: string;
  readonly severity: FaultSeverity;
  readonly resolvedAt: string | null;
  readonly downtimeMinutes: number | null;
}
