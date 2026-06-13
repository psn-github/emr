import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Consumables/implants captured at point of use (pure, 100%). Each line carries
// a code, lot/serial (traceability), quantity, and integer-fils unit price. The
// money math (line totals) stays in @oxford/billing — here we only validate and
// shape the lines; the line total is quantity × unit price (no float).

export interface ConsumableUseInput {
  readonly code: string;
  readonly description: string;
  /** Lot or serial number — mandatory for traceability (implants especially). */
  readonly lotNo: string;
  readonly quantity: number;
  readonly unitPriceFils: number;
}

/** Validate a consumable line: positive integer quantity, non-negative integer
 *  fils price, and a lot/serial present (no untraceable items at point of use). */
export function validateConsumableUse(input: ConsumableUseInput): Result<void, AppError> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return err(validationError("quantity must be a positive integer", "perioperative.consumable.bad_quantity"));
  }
  if (!Number.isInteger(input.unitPriceFils) || input.unitPriceFils < 0) {
    return err(validationError("unit price must be a non-negative integer (fils)", "perioperative.consumable.bad_price"));
  }
  if (input.lotNo.trim() === "") {
    return err(validationError("a lot/serial number is required for traceability", "perioperative.consumable.lot_required"));
  }
  return ok(undefined);
}

/** The line total in fils (integer) — quantity × unit price. */
export function lineTotalFils(input: ConsumableUseInput): number {
  return input.quantity * input.unitPriceFils;
}
