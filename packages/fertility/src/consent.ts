import type { Result } from "@oxford/core";
import { ok, err, preconditionFailed } from "@oxford/core";
import type { CycleType } from "./types.js";

// Per-cycle consent requirements (config — docs/01 §E3, docs/03). Progression
// out of `planned` is blocked until every required consent is signed. The exact
// consent SETS are clinic-configurable; these are the seed defaults.
const REQUIRED: Record<CycleType, readonly string[]> = {
  iui: ["consent.iui", "consent.data_processing"],
  ivf: ["consent.ivf", "consent.anaesthesia", "consent.data_processing"],
  icsi: ["consent.icsi", "consent.anaesthesia", "consent.data_processing"],
  fet: ["consent.fet", "consent.data_processing"],
  ivm: ["consent.ivm", "consent.anaesthesia", "consent.data_processing"],
  fertility_preservation: ["consent.preservation", "consent.storage", "consent.data_processing"],
  ovulation_induction: ["consent.ovulation_induction", "consent.data_processing"],
};

export function requiredConsents(type: CycleType): readonly string[] {
  return REQUIRED[type];
}

/** Block progression unless every required consent is signed. */
export function assertConsentsComplete(
  type: CycleType,
  signed: readonly string[],
): Result<void, ReturnType<typeof preconditionFailed>> {
  const signedSet = new Set(signed);
  const missing = requiredConsents(type).filter((c) => !signedSet.has(c));
  if (missing.length > 0) {
    return err(preconditionFailed(`missing consents: ${missing.join(", ")}`, "fertility.consent.incomplete"));
  }
  return ok(undefined);
}
