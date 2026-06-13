import type { Result, AppError } from "@oxford/core";
import { ok, err, preconditionFailed } from "@oxford/core";

// Stock issue logic (pure, 100%) — FEFO (first-expiry-first-out), expiry, and par
// checks. Quantities are whole units; issue can never drive stock negative.

export interface IssuableLot {
  readonly id: string;
  readonly quantity: number;
  readonly expiryDate: string;
}

export interface IssuePlanLine {
  readonly lotId: string;
  readonly quantity: number;
}

/** Plan a FEFO issue across lots; errors if total stock is insufficient (no
 *  negative stock). Earliest-expiry lots are consumed first. */
export function planFefoIssue(lots: readonly IssuableLot[], quantity: number): Result<readonly IssuePlanLine[], AppError> {
  const total = lots.reduce((s, l) => s + l.quantity, 0);
  if (quantity > total) {
    return err(preconditionFailed("insufficient stock for the requested quantity", "inventory.stock.insufficient"));
  }
  const sorted = [...lots].filter((l) => l.quantity > 0).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  const plan: IssuePlanLine[] = [];
  let remaining = quantity;
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.quantity);
    plan.push({ lotId: lot.id, quantity: take });
    remaining -= take;
  }
  return ok(plan);
}

/** Is a lot expired as of `asOf` (inclusive of the expiry instant)? */
export function isExpired(expiryDate: string, asOf: Date): boolean {
  return asOf.getTime() >= new Date(expiryDate).getTime();
}

/** Not yet expired but due within `days` (expiry-imminent alert)? */
export function isExpiringWithin(expiryDate: string, asOf: Date, days: number): boolean {
  if (isExpired(expiryDate, asOf)) return false;
  return new Date(expiryDate).getTime() <= asOf.getTime() + days * 24 * 60 * 60 * 1000;
}

/** Below the reorder (par) level → critical-stock alert. */
export function belowPar(onHand: number, parLevel: number): boolean {
  return onHand < parLevel;
}
