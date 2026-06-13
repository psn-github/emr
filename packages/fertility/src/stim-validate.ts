import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import { formularyItem, type DoseUnit } from "./formulary.js";

// Stimulation dose validation (the dose-affecting logic we own — 100% covered).
// Drugs MUST come from the formulary (no free text); the dose must be a positive
// number; the unit must match the formulary item's unit. NOTE: an individualised
// dosing CALCULATOR (ported from om-software) is a follow-on — this validates a
// clinician-entered dose, it does not compute one.

export interface DrugDoseInput {
  readonly formularyItemId: string;
  readonly dose: number;
  readonly unit: DoseUnit;
  readonly route?: string;
}

export function validateDrugDose(input: DrugDoseInput): Result<void, ReturnType<typeof validationError>> {
  const item = formularyItem(input.formularyItemId);
  if (item === null) {
    return err(validationError("drug is not in the formulary (no free-text prescribing)", "fertility.stim.unknown_drug"));
  }
  if (!Number.isFinite(input.dose) || input.dose <= 0) {
    return err(validationError("dose must be a positive number", "fertility.stim.bad_dose"));
  }
  if (input.unit !== item.unit) {
    return err(validationError(`unit ${input.unit} does not match the formulary unit ${item.unit}`, "fertility.stim.unit_mismatch"));
  }
  return ok(undefined);
}
