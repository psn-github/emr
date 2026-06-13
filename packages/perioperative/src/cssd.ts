import type { Result, AppError } from "@oxford/core";
import { ok, err, preconditionFailed } from "@oxford/core";

// CSSD / instrument-set sterility gate (pure, 100%). A set may only be used on a
// patient when it is `sterile` (its most recent sterilisation cycle passed and it
// has not been used since). Using a set marks it `used`; it must be reprocessed
// (a passing sterilisation cycle) before it is sterile again (docs/01 §E7).

export type SetStatus = "dirty" | "sterile" | "used";
export type SterilisationResult = "pass" | "fail";

/** A set is usable only when sterile. */
export function assertSetUsable(status: SetStatus): Result<void, AppError> {
  if (status !== "sterile") {
    return err(preconditionFailed(`instrument set is ${status}, not sterile`, "perioperative.cssd.not_sterile"));
  }
  return ok(undefined);
}

/** The set status implied by a sterilisation cycle result. */
export function statusAfterSterilisation(result: SterilisationResult): SetStatus {
  return result === "pass" ? "sterile" : "dirty";
}
