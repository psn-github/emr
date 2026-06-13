import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { BilingualText } from "./types.js";
import type { Fils } from "./money.js";
import { isValidAmount } from "./money.js";

// Packages & cycle bundles — pure logic (docs/01 §E11, ADR-0037). A package is a
// versioned config bundle of components (charge code + included quantity + unit
// value). Selling instantiates it on a patient; charge capture RECOGNISES usage
// against the included quantity, billing any excess as extra. Money is integer
// fils. 100% coverage (money/recognition is financial-safety logic).

export interface PackageComponentInput {
  readonly chargeCode: string;
  readonly description: BilingualText;
  /** Units of this component included in the package (whole, ≥ 1). */
  readonly includedQuantity: number;
  /** Per-unit value for recognition / excess billing (integer fils, ≥ 0). */
  readonly unitAmountFils: Fils;
}
export interface PackageInput {
  readonly code: string;
  readonly name: BilingualText;
  readonly components: readonly PackageComponentInput[];
  /** The package price the patient pays (integer fils, ≥ 0). */
  readonly priceFils: Fils;
}

/** Validate a package definition: non-empty code/name, ≥1 component with unique
 *  charge codes, whole positive included quantities, valid fils amounts. */
export function validatePackage(input: PackageInput): Result<void, AppError> {
  if (input.code.trim() === "") return err(validationError("package code is required", "billing.package.code_required"));
  if (input.name.en.trim() === "" || input.name.ar.trim() === "") return err(validationError("package name (en + ar) is required", "billing.package.name_required"));
  if (input.components.length === 0) return err(validationError("a package needs at least one component", "billing.package.empty"));
  if (!isValidAmount(input.priceFils)) return err(validationError("package price must be a non-negative integer (fils)", "billing.bad_amount"));
  const seen = new Set<string>();
  for (const c of input.components) {
    if (c.chargeCode.trim() === "") return err(validationError("component charge code is required", "billing.package.component_code_required"));
    if (seen.has(c.chargeCode)) return err(validationError("duplicate component charge code", "billing.package.duplicate_component"));
    seen.add(c.chargeCode);
    if (!Number.isInteger(c.includedQuantity) || c.includedQuantity < 1) return err(validationError("included quantity must be a positive whole number", "billing.package.bad_quantity"));
    if (!isValidAmount(c.unitAmountFils)) return err(validationError("component unit amount must be a non-negative integer (fils)", "billing.bad_amount"));
  }
  return ok(undefined);
}

export interface Recognition {
  /** Units covered by the package's remaining inclusion. */
  readonly consumed: number;
  /** Units beyond the inclusion — to be billed as extra. */
  readonly extra: number;
}

/** Recognise a requested quantity against a component's inclusion: consume up to
 *  what remains (included − alreadyConsumed), the rest is extra. */
export function recognise(includedQuantity: number, alreadyConsumed: number, requestedQuantity: number): Recognition {
  const available = Math.max(0, includedQuantity - alreadyConsumed);
  const consumed = Math.min(available, requestedQuantity);
  return { consumed, extra: requestedQuantity - consumed };
}
