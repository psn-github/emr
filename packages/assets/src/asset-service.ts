import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound, conflict, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Asset, AssetCategory, MaintenanceRecord, MaintenanceType, FaultRecord, FaultId, FaultSeverity } from "./types.js";
import type { AssetStore } from "./store.js";
import { latestNextDue } from "./store.js";
import { calibrationStatus, isDueWithin, assetUsability, validateMaintenanceDates, validateDowntime, type CalibrationStatus, type AssetUsability } from "./calibration.js";

export interface RegisterAssetInput {
  readonly name: string;
  readonly category: AssetCategory;
  readonly locationId: string;
  readonly serialNumber: string;
  readonly supplierId?: string;
  readonly warrantyExpiry?: string;
  readonly critical: boolean;
}
export interface RecordMaintenanceInput {
  readonly assetId: string;
  readonly type: MaintenanceType;
  readonly performedAt: string;
  readonly nextDueDate?: string;
  readonly notes?: string;
}
export interface ReportFaultInput {
  readonly assetId: string;
  readonly reportedAt: string;
  readonly description: string;
  readonly severity: FaultSeverity;
}

export interface AssetStatus {
  readonly asset: Asset;
  readonly calibration: CalibrationStatus;
  readonly calibrationDueDate: string | null;
  readonly usability: AssetUsability;
}
export interface PpmStatus {
  readonly nextDueDate: string | null;
  readonly overdue: boolean;
}
export interface CalibrationAlert {
  readonly assetId: string;
  readonly name: string;
  readonly critical: boolean;
  readonly calibration: CalibrationStatus;
  readonly dueDate: string | null;
}
export interface AssetAlerts {
  /** Critical assets blocked from use (overdue/missing calibration). */
  readonly blocking: readonly CalibrationAlert[];
  /** Non-critical overdue/missing — alert only, not blocking. */
  readonly nonBlocking: readonly CalibrationAlert[];
  /** Calibration current but due within the window — early warning. */
  readonly dueSoon: readonly CalibrationAlert[];
}

/**
 * Asset & biomedical-equipment management (docs/01 §E10). Asset register, PPM /
 * calibration scheduling with due-date alerting, and fault/downtime logging. The
 * patient-safety control (ADR-0029): a CRITICAL asset with overdue OR missing
 * calibration is BLOCKED from use — `assertUsable` is a server-side gate, and the
 * blocking set is data (the per-asset `critical` flag), not code.
 */
export class AssetService {
  constructor(
    private readonly store: AssetStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async registerAsset(actorId: string, input: RegisterAssetInput): Promise<Asset> {
    const asset: Asset = {
      id: newId<"Asset">(),
      name: input.name,
      category: input.category,
      locationId: input.locationId,
      serialNumber: input.serialNumber,
      supplierId: input.supplierId ?? null,
      warrantyExpiry: input.warrantyExpiry ?? null,
      critical: input.critical,
      status: "active",
    };
    await this.store.saveAsset(asset);
    await this.audit.record({ actorId, entityType: "Asset", entityId: asset.id, action: "CREATE", after: { name: asset.name, category: asset.category, critical: asset.critical } });
    await this.events.emit({ type: "AssetRegistered", aggregateType: "Asset", aggregateId: asset.id, data: { category: asset.category, critical: asset.critical } });
    return asset;
  }

  async recordMaintenance(actorId: string, input: RecordMaintenanceInput): Promise<Result<MaintenanceRecord, AppError>> {
    const asset = await this.store.getAsset(asId<"Asset">(input.assetId));
    if (asset === undefined) return err(notFound("asset not found", "assets.asset.not_found"));
    const dates = validateMaintenanceDates(input.performedAt, input.nextDueDate ?? null);
    if (!dates.ok) return err(dates.error);
    const rec: MaintenanceRecord = {
      id: newId<"Maintenance">(),
      assetId: input.assetId,
      type: input.type,
      performedAt: input.performedAt,
      performedBy: actorId,
      nextDueDate: input.nextDueDate ?? null,
      notes: input.notes ?? "",
    };
    await this.store.saveMaintenance(rec);
    await this.audit.record({ actorId, entityType: "Maintenance", entityId: rec.id, action: "CREATE", after: { assetId: input.assetId, type: input.type, nextDueDate: rec.nextDueDate } });
    await this.events.emit({ type: "MaintenanceRecorded", aggregateType: "Asset", aggregateId: input.assetId, data: { type: input.type } });
    return ok(rec);
  }

  async reportFault(actorId: string, input: ReportFaultInput): Promise<Result<FaultRecord, AppError>> {
    const asset = await this.store.getAsset(asId<"Asset">(input.assetId));
    if (asset === undefined) return err(notFound("asset not found", "assets.asset.not_found"));
    const fault: FaultRecord = {
      id: newId<"Fault">(),
      assetId: input.assetId,
      reportedAt: input.reportedAt,
      reportedBy: actorId,
      description: input.description,
      severity: input.severity,
      resolvedAt: null,
      downtimeMinutes: null,
    };
    await this.store.saveFault(fault);
    await this.audit.record({ actorId, entityType: "Fault", entityId: fault.id, action: "CREATE", after: { assetId: input.assetId, severity: input.severity } });
    await this.events.emit({ type: "FaultReported", aggregateType: "Asset", aggregateId: input.assetId, data: { severity: input.severity } });
    return ok(fault);
  }

  async resolveFault(actorId: string, faultId: FaultId, resolvedAt: string, downtimeMinutes: number): Promise<Result<FaultRecord, AppError>> {
    const fault = await this.store.getFault(faultId);
    if (fault === undefined) return err(notFound("fault not found", "assets.fault.not_found"));
    if (fault.resolvedAt !== null) return err(conflict("fault already resolved", "assets.fault.already_resolved"));
    const dt = validateDowntime(downtimeMinutes);
    if (!dt.ok) return err(dt.error);
    const resolved: FaultRecord = { ...fault, resolvedAt, downtimeMinutes };
    await this.store.saveFault(resolved);
    await this.audit.record({ actorId, entityType: "Fault", entityId: fault.id, action: "UPDATE", after: { resolvedAt, downtimeMinutes } });
    await this.events.emit({ type: "FaultResolved", aggregateType: "Asset", aggregateId: fault.assetId, data: { downtimeMinutes } });
    return ok(resolved);
  }

  /** PPM (planned preventive maintenance) due status for an asset as of a point
   *  in time. Unlike calibration, PPM is not a use-blocking gate — this surfaces
   *  the next-due date and whether it is overdue (e.g. for cryotank linkage). */
  async ppmStatus(assetId: string, asOf: Date): Promise<Result<PpmStatus, AppError>> {
    const asset = await this.store.getAsset(asId<"Asset">(assetId));
    if (asset === undefined) return err(notFound("asset not found", "assets.asset.not_found"));
    const nextDueDate = latestNextDue(await this.store.maintenanceForAsset(assetId), "ppm");
    const overdue = nextDueDate !== null && asOf.getTime() > new Date(nextDueDate).getTime();
    return ok({ nextDueDate, overdue });
  }

  /** Calibration + usability for an asset as of a point in time. */
  async assetStatus(assetId: string, asOf: Date): Promise<Result<AssetStatus, AppError>> {
    const asset = await this.store.getAsset(asId<"Asset">(assetId));
    if (asset === undefined) return err(notFound("asset not found", "assets.asset.not_found"));
    const records = await this.store.maintenanceForAsset(assetId);
    const dueDate = latestNextDue(records, "calibration");
    const calibration = calibrationStatus(dueDate, asOf);
    return ok({ asset, calibration, calibrationDueDate: dueDate, usability: assetUsability(asset.critical, calibration) });
  }

  /** Server-side use-blocking gate: a critical asset with overdue/missing
   *  calibration may NOT be used (ADR-0029). Other modules call this before use. */
  async assertUsable(assetId: string, asOf: Date): Promise<Result<void, AppError>> {
    const status = await this.assetStatus(assetId, asOf);
    if (!status.ok) return err(status.error);
    if (!status.value.usability.usable) {
      return err(validationError("critical asset blocked: calibration not current", "assets.use.blocked"));
    }
    return ok(undefined);
  }

  /** Calibration alerts across the active fleet: blocking (critical, not OK),
   *  non-blocking (non-critical, not OK), and due-soon early warnings. */
  async alerts(asOf: Date, withinDays: number): Promise<AssetAlerts> {
    const assets = (await this.store.assets()).filter((a) => a.status === "active");
    const blocking: CalibrationAlert[] = [];
    const nonBlocking: CalibrationAlert[] = [];
    const dueSoon: CalibrationAlert[] = [];
    for (const asset of assets) {
      const records = await this.store.maintenanceForAsset(asset.id);
      const dueDate = latestNextDue(records, "calibration");
      const status = calibrationStatus(dueDate, asOf);
      const alert: CalibrationAlert = { assetId: asset.id, name: asset.name, critical: asset.critical, calibration: status, dueDate };
      if (status !== "ok") {
        if (asset.critical) blocking.push(alert);
        else nonBlocking.push(alert);
      } else if (isDueWithin(dueDate, asOf, withinDays)) {
        dueSoon.push(alert);
      }
    }
    return { blocking, nonBlocking, dueSoon };
  }

  // ---- read side ----
  list(): Promise<readonly Asset[]> {
    return this.store.assets();
  }
  maintenance(assetId: string): Promise<readonly MaintenanceRecord[]> {
    return this.store.maintenanceForAsset(assetId);
  }
  faults(assetId: string): Promise<readonly FaultRecord[]> {
    return this.store.faultsForAsset(assetId);
  }
}
