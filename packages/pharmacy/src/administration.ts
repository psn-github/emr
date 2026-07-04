import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError, conflict, preconditionFailed } from "@oxford/core";
import type {
  PrescriptionStatus,
  PrescriptionItem,
  PrescriptionItemInput,
  TheatreDrugInput,
  StockAllocation,
  AllergyWarning,
} from "./types.js";

// Pure pharmacy drug-safety logic (100% coverage — CLAUDE.md drugs bar). Two
// concerns, both I/O-free so the rules are exhaustively testable:
//   • the PRESCRIPTION status lifecycle + item validation + allergy screen
//     (external-fulfilment flow — no stock movement);
//   • the THEATRE ADMINISTRATION drug-quantity logic (cold-chain + controlled-
//     witness requirements, stock sufficiency, FEFO allocation cover).
// Quantities are whole units.

/** The actions that transition a prescription's status (ADR-0069). */
export type PrescriptionAction = "issue" | "fulfil" | "cancel";

/**
 * The prescription lifecycle: `pending → issued → fulfilled`, with `cancel`
 * reachable pre-fulfilment only (from `pending` or `issued`). `fulfilled` is the
 * external pharmacy's handover confirmation, not a dispense — no stock moves. Any
 * other transition is a conflict — the flow never skips, reverses, or re-fulfils.
 */
export function nextStatus(current: PrescriptionStatus, action: PrescriptionAction): Result<PrescriptionStatus, AppError> {
  switch (action) {
    case "issue":
      return current === "pending" ? ok<PrescriptionStatus>("issued") : invalidTransition(current, action);
    case "fulfil":
      return current === "issued" ? ok<PrescriptionStatus>("fulfilled") : invalidTransition(current, action);
    case "cancel":
      return current === "pending" || current === "issued" ? ok<PrescriptionStatus>("cancelled") : invalidTransition(current, action);
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

// ── Theatre administration drug-quantity logic ────────────────────────────────

/** The minimal drug-line shape the theatre-administration safety checks need. */
export interface DrugLine {
  readonly drugId: string;
  readonly quantity: number;
  readonly controlled: boolean;
  readonly coldChain: boolean;
}

/** Validate submitted theatre drugs: at least one line; each quantity a positive
 *  whole number (the stock units decremented). */
export function validateTheatreDrugs(drugs: readonly TheatreDrugInput[]): Result<void, AppError> {
  if (drugs.length === 0) return err(validationError("an administration needs at least one drug", "pharmacy.admin.empty"));
  for (const d of drugs) {
    if (!Number.isInteger(d.quantity) || d.quantity <= 0) {
      return err(validationError("quantity must be a positive whole number", "pharmacy.admin.quantity_invalid"));
    }
  }
  return ok(undefined);
}

/** The controlled lines in an administration (their movement posts to the register). */
export function controlledDrugItems<T extends DrugLine>(items: readonly T[]): readonly T[] {
  return items.filter((it) => it.controlled);
}

/** A cold-chain administration requires the administrator to explicitly assert the
 *  cold chain was handled; otherwise it is rejected. */
export function assertColdChainHandled(items: readonly DrugLine[], coldChainHandled: boolean): Result<void, AppError> {
  if (items.some((it) => it.coldChain) && !coldChainHandled) {
    return err(validationError("cold-chain items require the cold-chain-handled assertion", "pharmacy.admin.cold_chain_required"));
  }
  return ok(undefined);
}

/** A controlled administration requires a second-person witness (the register
 *  movement is a two-person, witnessed event). */
export function assertWitnessForControlled(items: readonly DrugLine[], witnessStaffId: string | undefined): Result<void, AppError> {
  if (items.some((it) => it.controlled) && (witnessStaffId === undefined || witnessStaffId.trim() === "")) {
    return err(validationError("controlled items require a witnessing staff member", "pharmacy.admin.witness_required"));
  }
  return ok(undefined);
}

/** Pre-flight sufficiency: every item's on-hand must cover its quantity, so an
 *  administration never partially decrements stock on a shortfall (drug-safety). */
export function assertSufficientStock(items: readonly DrugLine[], availableByDrug: ReadonlyMap<string, number>): Result<void, AppError> {
  for (const it of items) {
    if ((availableByDrug.get(it.drugId) ?? 0) < it.quantity) {
      return err(preconditionFailed("insufficient stock to administer", "pharmacy.admin.insufficient_stock"));
    }
  }
  return ok(undefined);
}

/** Total quantity allocated to a drug across the administration's lots. */
export function totalAllocated(allocations: readonly StockAllocation[], drugId: string): number {
  return allocations.filter((a) => a.drugId === drugId).reduce((sum, a) => sum + a.quantity, 0);
}

/** The allocations must exactly cover each item's quantity — no over-, no under-
 *  administration (validates the FEFO result). */
export function assertAllocationsCoverItems(items: readonly DrugLine[], allocations: readonly StockAllocation[]): Result<void, AppError> {
  for (const it of items) {
    if (totalAllocated(allocations, it.drugId) !== it.quantity) {
      return err(validationError("allocations must exactly cover each drug quantity", "pharmacy.admin.allocation_mismatch"));
    }
  }
  return ok(undefined);
}
