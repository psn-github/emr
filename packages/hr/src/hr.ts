import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Pure HR logic (docs/01 §E14, ADR-0040). Credential expiry status and shift
// validation. 100% coverage — licence/competency currency is fitness-to-practise.

export type CredentialStatus = "valid" | "expiring" | "expired";

/** Expiry status as of `asOf`: expired (past), expiring (due within `withinDays`),
 *  else valid. */
export function credentialStatus(expiresAt: string, asOf: Date, withinDays: number): CredentialStatus {
  const exp = new Date(expiresAt).getTime();
  if (asOf.getTime() > exp) return "expired";
  if (exp <= asOf.getTime() + withinDays * 24 * 60 * 60 * 1000) return "expiring";
  return "valid";
}

/** A credential's validity window must be non-empty (expiry after issue). */
export function validateCredentialDates(issuedAt: string, expiresAt: string): Result<void, AppError> {
  if (new Date(expiresAt).getTime() <= new Date(issuedAt).getTime()) {
    return err(validationError("expiry must be after the issue date", "hr.credential.bad_dates"));
  }
  return ok(undefined);
}

/** A shift must end after it starts. */
export function validateShift(start: string, end: string): Result<void, AppError> {
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return err(validationError("shift end must be after its start", "hr.shift.bad_window"));
  }
  return ok(undefined);
}

/** A leave period must end after it starts. */
export function validateLeave(start: string, end: string): Result<void, AppError> {
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return err(validationError("leave end must be after its start", "hr.leave.bad_window"));
  }
  return ok(undefined);
}

/** True when two [start,end) windows overlap (used for availability lookups). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}
