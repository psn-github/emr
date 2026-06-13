import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { PgtType } from "./types.js";

// PGT policy logic (pure, 100%). The set of PERMITTED indications is clinic
// configuration bounded by legal counsel — there is no hardcoded list here, and
// the default configuration is EMPTY, so a PGT order is rejected until the clinic
// has configured its counsel-confirmed permitted indications. This is the
// conservative posture: never assume an indication is permitted.

export const PGT_TYPES: readonly PgtType[] = ["PGT-A", "PGT-M", "PGT-SR"];

/** Is this indication in the clinic's configured (counsel-confirmed) permitted set? */
export function assertPgtIndicationPermitted(indication: string, permitted: readonly string[]): Result<void, AppError> {
  if (!permitted.includes(indication)) {
    return err(validationError("PGT indication is not in the clinic's permitted set", "embryology.pgt.indication_not_permitted"));
  }
  return ok(undefined);
}
