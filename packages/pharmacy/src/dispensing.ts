import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError, conflict, preconditionFailed } from "@oxford/core";
import type {
  PrescriptionStatus,
  PrescriptionItem,
  PrescriptionItemInput,
  DispenseAllocation,
  AllergyWarning,
} from "./types.js";

// Pure dispensing / drug-quantity logic (100% coverage — CLAUDE.md drugs bar).
// The status lifecycle, prescription-item validation, allergy screen, cold-chain
// + controlled-witness requirements, stock-sufficiency and allocation math all
// live here as pure functions so the drug-safety rules are exhaustively testable
// and free of I/O. Quantities are whole units.

/** The actions that transition a prescription's status. */
export type PrescriptionAction = "dispense" | "ready" | "collected" | "cancel";

/**
 * The dispensing-queue lifecycle: `pending → dispensing → ready → collected`,
 * with `cancel` reachable pre-dispense only (`pending → cancelled`). Any other
 * transition is a conflict — the queue never skips or reverses a step.
 */
export function nextStatus(current: PrescriptionStatus, action: PrescriptionAction): Result<PrescriptionStatus, AppError> {
  switch (action) {
    case "dispense":
      return current === "pending" ? ok<PrescriptionStatus>("dispensing") : invalidTransition(current, action);
    case "ready":
      return current === "dispensing" ? ok<PrescriptionStatus>("ready") : invalidTransition(current, action);
    case "collected":
      return current === "ready" ? ok<PrescriptionStatus>("collected") : invalidTransition(current, action);
    case "cancel":
      return current === "pending" ? ok<PrescriptionStatus>("cancelled") : invalidTransition(current, action);
  }
}

function invalidTransition(current: PrescriptionStatus, action: PrescriptionAction): Result<PrescriptionStatus, AppError> {
  return err(conflict(`cannot ${action} a prescription that is ${current}`, "pharmacy.status.invalid_transition"));
}

/** Validate the submitted prescription items: at least one line; each quantity a
 *  positive whole number; each dose instruction present in both languages. */
export function validatePrescriptionItems(items: readonly PrescriptionItemInput[]): Result<void, AppError> {
  if (items.length === 0) return err(validationError("a prescription needs at least one item", "pharmacy.rx.empty"));
  for (const it of items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      return err(validationError("quantity must be a positive whole number", "pharmacy.rx.quantity_invalid"));
    }
    if (it.doseInstruction.en.trim() === "" || it.doseInstruction.ar.trim() === "") {
      return err(validationError("dose instruction is required in both languages", "pharmacy.rx.dose_required"));
    }
  }
  return ok(undefined);
}

/** Advisory allergy screen (ADR-0060) — match each prescribed item by drug class
 *  against the patient's active allergic classes. Pure; never blocks. */
export function screenPrescription(items: readonly PrescriptionItem[], allergicClasses: readonly string[]): AllergyWarning[] {
  if (allergicClasses.length === 0) return [];
  const flagged = new Set(allergicClasses);
  const warnings: AllergyWarning[] = [];
  for (const it of items) {
    if (flagged.has(it.drugClass)) warnings.push({ drugId: it.drugId, drugClass: it.drugClass });
  }
  return warnings;
}

/** The controlled items on a prescription (their dispense posts to the register). */
export function controlledItems(items: readonly PrescriptionItem[]): readonly PrescriptionItem[] {
  return items.filter((it) => it.controlled);
}

/** A cold-chain prescription requires the dispenser to explicitly assert the
 *  cold chain was handled; otherwise the dispense is rejected. */
export function assertColdChainHandled(items: readonly PrescriptionItem[], coldChainHandled: boolean): Result<void, AppError> {
  if (items.some((it) => it.coldChain) && !coldChainHandled) {
    return err(validationError("cold-chain items require the cold-chain-handled assertion", "pharmacy.dispense.cold_chain_required"));
  }
  return ok(undefined);
}

/** A controlled prescription requires a second-person witness on the dispense
 *  input (the register movement is a two-person, witnessed event). */
export function assertWitnessForControlled(items: readonly PrescriptionItem[], witnessStaffId: string | undefined): Result<void, AppError> {
  if (items.some((it) => it.controlled) && (witnessStaffId === undefined || witnessStaffId.trim() === "")) {
    return err(validationError("controlled items require a witnessing staff member", "pharmacy.dispense.witness_required"));
  }
  return ok(undefined);
}

/** Pre-flight sufficiency: every item's on-hand must cover its quantity, so a
 *  dispense never partially decrements stock and the prescription stays pending
 *  on a shortfall (drug-safety: no half-dispensed script). */
export function assertSufficientStock(items: readonly PrescriptionItem[], availableByDrug: ReadonlyMap<string, number>): Result<void, AppError> {
  for (const it of items) {
    if ((availableByDrug.get(it.drugId) ?? 0) < it.quantity) {
      return err(preconditionFailed("insufficient stock to dispense", "pharmacy.dispense.insufficient_stock"));
    }
  }
  return ok(undefined);
}

/** Total quantity allocated to a drug across the dispense's lots. */
export function totalAllocated(allocations: readonly DispenseAllocation[], drugId: string): number {
  return allocations.filter((a) => a.drugId === drugId).reduce((sum, a) => sum + a.quantity, 0);
}

/** The allocations must exactly cover each item's quantity — no over-, no under-
 *  dispense (validates both the FEFO result and a manual override). */
export function assertAllocationsCoverItems(items: readonly PrescriptionItem[], allocations: readonly DispenseAllocation[]): Result<void, AppError> {
  for (const it of items) {
    if (totalAllocated(allocations, it.drugId) !== it.quantity) {
      return err(validationError("dispense allocations must exactly cover each item quantity", "pharmacy.dispense.allocation_mismatch"));
    }
  }
  return ok(undefined);
}
