import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Pure calibration / usability logic (docs/01 §E10, ADR-0029). The patient-safety
// rule: a CRITICAL asset may be used only if its calibration is current. Overdue
// OR never-recorded calibration on a critical asset blocks its use; non-critical
// assets are alert-only. 100% coverage — this is a safety gate.

export type CalibrationStatus = "ok" | "overdue" | "none";

/** Calibration status from the next-due date (null = never calibrated). Overdue
 *  once the due date has passed (asOf strictly after nextDue). */
export function calibrationStatus(nextDue: string | null, asOf: Date): CalibrationStatus {
  if (nextDue === null) return "none";
  return asOf.getTime() > new Date(nextDue).getTime() ? "overdue" : "ok";
}

/** True when calibration is current but due within `days` (an early-warning). */
export function isDueWithin(nextDue: string | null, asOf: Date, days: number): boolean {
  if (nextDue === null) return false;
  const due = new Date(nextDue).getTime();
  if (asOf.getTime() > due) return false; // already overdue, not "due soon"
  return due <= asOf.getTime() + days * 24 * 60 * 60 * 1000;
}

export type AssetUsability = { readonly usable: true } | { readonly usable: false; readonly reason: "calibration_overdue" | "calibration_missing" };

/** The use-blocking gate: a critical asset is usable only when calibration is OK.
 *  Non-critical assets are always usable (overdue raises an alert, not a block). */
export function assetUsability(critical: boolean, status: CalibrationStatus): AssetUsability {
  if (critical && status !== "ok") {
    return { usable: false, reason: status === "overdue" ? "calibration_overdue" : "calibration_missing" };
  }
  return { usable: true };
}

/** A maintenance record with a future due-date must have nextDue after performedAt. */
export function validateMaintenanceDates(performedAt: string, nextDueDate: string | null): Result<void, AppError> {
  if (nextDueDate !== null && new Date(nextDueDate).getTime() <= new Date(performedAt).getTime()) {
    return err(validationError("next due date must be after the maintenance date", "assets.maintenance.due_before_performed"));
  }
  return ok(undefined);
}

/** Resolved downtime is a non-negative whole number of minutes. */
export function validateDowntime(downtimeMinutes: number): Result<void, AppError> {
  if (!Number.isInteger(downtimeMinutes) || downtimeMinutes < 0) {
    return err(validationError("downtime must be a non-negative whole number of minutes", "assets.fault.downtime_invalid"));
  }
  return ok(undefined);
}
