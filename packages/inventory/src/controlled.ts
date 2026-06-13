import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Controlled-drugs register — pure legal-grade ledger logic (docs/01 §E8 P0). A
// CD register is append-only, witnessed (two-person), and reconcilable: the
// running balance can never go negative, and a physical count must reconcile
// against the book balance. The Kuwaiti schedule classification and the MOH
// report FORMAT are configuration/regulatory specifics (AMD-0005), not encoded
// here. 100% coverage — this is drug-safety logic.

export type CdMovementType = "receipt" | "issue" | "wastage" | "destruction" | "return" | "adjustment";

/** In-movements increase the register balance; out-movements decrease it;
 *  an adjustment sets the balance to a counted figure (reconciliation). */
export function movementDirection(type: CdMovementType): "in" | "out" | "set" {
  if (type === "receipt" || type === "return") return "in";
  if (type === "adjustment") return "set";
  return "out";
}

/**
 * The book balance after applying a movement to the prior balance.
 * - receipt/return add; issue/wastage/destruction subtract (never below zero);
 * - adjustment SETS the balance to the counted figure (`quantity`, may be 0).
 * Quantities are whole, non-negative; non-adjustment movements must be positive.
 */
export function newBalance(prior: number, type: CdMovementType, quantity: number): Result<number, AppError> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return err(validationError("quantity must be a whole, non-negative number", "inventory.cd.quantity_invalid"));
  }
  switch (movementDirection(type)) {
    case "set":
      return ok(quantity);
    case "in":
      if (quantity <= 0) return err(validationError("quantity must be positive", "inventory.cd.quantity_invalid"));
      return ok(prior + quantity);
    case "out": {
      if (quantity <= 0) return err(validationError("quantity must be positive", "inventory.cd.quantity_invalid"));
      const after = prior - quantity;
      if (after < 0) return err(validationError("would drive the controlled register negative", "inventory.cd.negative"));
      return ok(after);
    }
  }
}

/** Every controlled-drug movement is a two-person event: the witness must be a
 *  second, distinct, named person (legal-grade). */
export function validateWitness(actorId: string, witnessedBy: string): Result<void, AppError> {
  if (witnessedBy.trim() === "") return err(validationError("a witness is required", "inventory.cd.witness_required"));
  if (witnessedBy === actorId) return err(validationError("the witness must be a second person", "inventory.cd.witness_same_person"));
  return ok(undefined);
}

export interface Reconciliation {
  readonly registerBalance: number;
  readonly physicalCount: number;
  /** physicalCount − registerBalance (negative = stock missing vs the book). */
  readonly discrepancy: number;
  readonly matched: boolean;
}

/** Reconcile a physical count against the book balance. */
export function reconcile(registerBalance: number, physicalCount: number): Reconciliation {
  const discrepancy = physicalCount - registerBalance;
  return { registerBalance, physicalCount, discrepancy, matched: discrepancy === 0 };
}
