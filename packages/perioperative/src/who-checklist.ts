import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError, preconditionFailed } from "@oxford/core";

// WHO Surgical Safety Checklist (pure, 100%) — a BLOCKING, audited patient-safety
// gate (docs/01 §E7). Three phases in order: sign-in (before anaesthesia),
// time-out (before incision), sign-out (before the patient leaves theatre). A
// phase is complete only when every REQUIRED item is confirmed; phases must be
// done in order; the journey cannot ENTER theatre without sign-in + time-out, nor
// LEAVE theatre without sign-out. There is no override.

export type WhoPhase = "sign_in" | "time_out" | "sign_out";

/** Required checklist items per phase (configuration — the clinic may extend). */
export const WHO_REQUIRED_ITEMS: Record<WhoPhase, readonly string[]> = {
  sign_in: ["identity_confirmed", "site_marked", "anaesthesia_safety_check", "pulse_oximeter_on", "allergy_checked"],
  time_out: ["team_introduced", "patient_site_procedure_confirmed", "antibiotic_prophylaxis", "critical_events_reviewed"],
  sign_out: ["procedure_recorded", "counts_correct", "specimen_labelled", "equipment_issues_noted"],
};

export interface PhaseRecord {
  readonly confirmedItems: readonly string[];
  readonly completedBy: string;
  readonly completedAt: string;
}

export interface WhoChecklist {
  readonly encounterId: string;
  readonly sign_in: PhaseRecord | null;
  readonly time_out: PhaseRecord | null;
  readonly sign_out: PhaseRecord | null;
}

/** Is a phase complete — recorded AND all its required items confirmed? */
export function phaseComplete(record: PhaseRecord | null, phase: WhoPhase): boolean {
  if (record === null) return false;
  const confirmed = new Set(record.confirmedItems);
  return WHO_REQUIRED_ITEMS[phase].every((item) => confirmed.has(item));
}

/** All required items for a phase present in the confirmed set? */
export function assertPhaseItemsComplete(phase: WhoPhase, confirmedItems: readonly string[]): Result<void, AppError> {
  const confirmed = new Set(confirmedItems);
  const missing = WHO_REQUIRED_ITEMS[phase].filter((item) => !confirmed.has(item));
  if (missing.length > 0) {
    return err(validationError(`WHO ${phase}: ${missing.length} required item(s) not confirmed`, "perioperative.who.items_incomplete"));
  }
  return ok(undefined);
}

/** Phases must be completed in order (sign_in → time_out → sign_out). */
export function assertPhaseOrder(checklist: WhoChecklist, phase: WhoPhase): Result<void, AppError> {
  if (phase === "time_out" && !phaseComplete(checklist.sign_in, "sign_in")) {
    return err(preconditionFailed("WHO sign-in must be completed before time-out", "perioperative.who.out_of_order"));
  }
  if (phase === "sign_out" && !phaseComplete(checklist.time_out, "time_out")) {
    return err(preconditionFailed("WHO time-out must be completed before sign-out", "perioperative.who.out_of_order"));
  }
  return ok(undefined);
}

/** BLOCKING gate: a patient may enter theatre only after sign-in + time-out. */
export function assertMayEnterTheatre(checklist: WhoChecklist): Result<void, AppError> {
  if (!phaseComplete(checklist.sign_in, "sign_in") || !phaseComplete(checklist.time_out, "time_out")) {
    return err(preconditionFailed("WHO sign-in + time-out must be complete before incision", "perioperative.who.not_ready_for_theatre"));
  }
  return ok(undefined);
}

/** BLOCKING gate: a patient may leave theatre only after sign-out. */
export function assertMayLeaveTheatre(checklist: WhoChecklist): Result<void, AppError> {
  if (!phaseComplete(checklist.sign_out, "sign_out")) {
    return err(preconditionFailed("WHO sign-out must be complete before leaving theatre", "perioperative.who.not_ready_to_leave"));
  }
  return ok(undefined);
}
