import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Money is integer FILS (1 KWD = 1000 fils). Never floats — all arithmetic is
// integer, so there is no rounding drift. 100% test coverage (CLAUDE.md money bar).

export type Fils = number; // a non-negative integer count of fils

export function isValidAmount(fils: number): boolean {
  return Number.isInteger(fils) && fils >= 0;
}

/** Validate an amount is a non-negative integer number of fils. */
export function assertAmount(fils: number): Result<Fils, ReturnType<typeof validationError>> {
  if (!isValidAmount(fils)) {
    return err(validationError("amount must be a non-negative integer (fils)", "billing.bad_amount"));
  }
  return ok(fils);
}

/** A line's total = unit amount × quantity (quantity ≥ 1). */
export function lineTotal(amountFils: Fils, quantity: number): Fils {
  return amountFils * quantity;
}

export function subtotal(lineTotals: readonly Fils[]): Fils {
  return lineTotals.reduce((sum, n) => sum + n, 0);
}

/** Tax in fils from a rate in basis points (e.g. 0 = no VAT in Kuwait today),
 *  floored to whole fils. */
export function taxAmount(subtotalFils: Fils, rateBps: number): Fils {
  return Math.floor((subtotalFils * rateBps) / 10000);
}

export function invoiceTotal(subtotalFils: Fils, taxFils: Fils): Fils {
  return subtotalFils + taxFils;
}

export function balance(totalFils: Fils, paidFils: Fils): Fils {
  return totalFils - paidFils;
}

/** Format fils as a KWD string with 3 decimal places (display only). */
export function formatKwd(fils: Fils): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const dinars = Math.floor(abs / 1000);
  const rem = (abs % 1000).toString().padStart(3, "0");
  return `${sign}${dinars}.${rem} KWD`;
}
