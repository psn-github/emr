import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Intra-operative anaesthetic drug administration (pure, 100%). Drugs come from a
// controlled formulary — never free text (CLAUDE.md hard rule) — with a positive
// dose and a unit matching the formulary entry. The anaesthesia formulary is
// configuration (the clinic's list); a representative seed is provided.

export type AnaesthesiaUnit = "mg" | "mcg" | "ml" | "IU";

export interface FormularyDrug {
  readonly code: string;
  readonly unit: AnaesthesiaUnit;
}

/** Seed anaesthesia formulary (configuration — extend per clinic pharmacy). */
export const ANAESTHESIA_FORMULARY: readonly FormularyDrug[] = [
  { code: "propofol", unit: "mg" },
  { code: "fentanyl", unit: "mcg" },
  { code: "rocuronium", unit: "mg" },
  { code: "midazolam", unit: "mg" },
  { code: "sevoflurane", unit: "ml" },
  { code: "lidocaine", unit: "mg" },
];

export interface DrugAdministrationInput {
  readonly formularyCode: string;
  readonly dose: number;
  readonly unit: AnaesthesiaUnit;
}

/** Validate a drug administration against the formulary: known code, positive
 *  dose, matching unit. No free text. */
export function validateDrugAdministration(input: DrugAdministrationInput, formulary: readonly FormularyDrug[] = ANAESTHESIA_FORMULARY): Result<void, AppError> {
  const item = formulary.find((d) => d.code === input.formularyCode);
  if (item === undefined) {
    return err(validationError("anaesthetic drug must come from the formulary", "perioperative.anaesthesia.not_in_formulary"));
  }
  if (!Number.isFinite(input.dose) || input.dose <= 0) {
    return err(validationError("dose must be a positive number", "perioperative.anaesthesia.bad_dose"));
  }
  if (input.unit !== item.unit) {
    return err(validationError(`unit ${input.unit} does not match the formulary unit ${item.unit}`, "perioperative.anaesthesia.unit_mismatch"));
  }
  return ok(undefined);
}
