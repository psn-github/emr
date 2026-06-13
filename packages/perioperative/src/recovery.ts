import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError, preconditionFailed } from "@oxford/core";

// Recovery scoring + discharge readiness (pure, 100%). Recovery uses the modified
// Aldrete score (0–10) in L1. Discharge from L2 is a BLOCKING gate: it requires
// the discharge prescription to be fulfilled/handed over by the Ground-floor
// pharmacy (PharmacyPort) AND a follow-up booked (docs/01 §E7; ADR-0025).

/** Validate a modified Aldrete recovery score (integer 0–10). */
export function validateAldrete(score: number): Result<void, AppError> {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return err(validationError("Aldrete score must be an integer 0–10", "perioperative.recovery.bad_aldrete"));
  }
  return ok(undefined);
}

/** Discharge is allowed only when the prescription is fulfilled AND a follow-up
 *  is booked. The most safety-critical failure (medication handover) surfaces first. */
export function assertDischargeReady(prescriptionFulfilled: boolean, followUpBooked: boolean): Result<void, AppError> {
  if (!prescriptionFulfilled) {
    return err(preconditionFailed("discharge prescription is not yet fulfilled by pharmacy", "perioperative.discharge.prescription_unfulfilled"));
  }
  if (!followUpBooked) {
    return err(preconditionFailed("a follow-up must be booked before discharge", "perioperative.discharge.followup_required"));
  }
  return ok(undefined);
}
