import type { DrugDoseInput } from "./stim-validate.js";
import { formularyItem } from "./formulary.js";

// Prescribe-time allergy advisory (docs/01 §E8, ADR-0060). The patient allergy
// list is clinical PHI, and fertility must not read the clinical module's tables
// (module boundaries) — so the app injects an AllergyPort wired to
// clinical.allergicClasses. The check is ADVISORY ONLY: it never blocks
// prescribing (a clinician may knowingly prescribe despite a recorded allergy);
// it surfaces a warning that is recorded on the stimulation day and audited.
export interface AllergyPort {
  /** Active allergy drug-class codes for a patient. */
  allergicClasses(patientId: string): Promise<readonly string[]>;
}

/** One prescribed drug that matched a recorded allergy (by drug class). */
export interface AllergyWarning {
  readonly formularyItemId: string;
  readonly drugClass: string;
}

/** Compute advisory warnings for the prescribed drugs given the patient's
 *  allergic drug classes. Pure (no I/O); each formulary item is matched by its
 *  class. A drug not in the formulary cannot be prescribed (validated upstream),
 *  so it raises no warning here. */
export function screenDrugs(drugs: readonly DrugDoseInput[], allergicClasses: readonly string[]): AllergyWarning[] {
  if (allergicClasses.length === 0) return [];
  const flagged = new Set(allergicClasses);
  const warnings: AllergyWarning[] = [];
  for (const drug of drugs) {
    const item = formularyItem(drug.formularyItemId);
    if (item !== null && flagged.has(item.drugClass)) {
      warnings.push({ formularyItemId: drug.formularyItemId, drugClass: item.drugClass });
    }
  }
  return warnings;
}
