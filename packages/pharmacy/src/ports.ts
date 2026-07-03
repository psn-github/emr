import type { Result, AppError } from "@oxford/core";
import type { DispenseAllocation } from "./types.js";

// Injected seams (ADR-0066). @oxford/pharmacy is a DOMAIN module: it never imports
// the fertility formulary, the inventory module, or clinical (module boundaries).
// Every integration is a port DEFINED here and IMPLEMENTED in the app layer
// (apps/api/src/context.ts) over the other modules' published read/issue surfaces.

/** The prescribable-drug attributes the pharmacy needs. `controlled`/`coldChain`
 *  are optional at the seam (a plain formulary drug is neither) and normalised to
 *  a boolean by the service. */
export interface DrugInfo {
  readonly nameEn: string;
  readonly nameAr: string;
  readonly drugClass: string;
  readonly controlled?: boolean;
  readonly coldChain?: boolean;
}

/** Formulary seam — the ONLY source of prescribable drugs (CLAUDE.md hard rule:
 *  prescribable items come from the formulary, never free text). The app wires
 *  this over the fertility formulary's published read surface (name + drug class);
 *  controlled/cold-chain come from the inventory catalogue's item attributes. */
export interface FormularyPort {
  isPrescribable(drugId: string): Promise<boolean>;
  drugInfo(drugId: string): Promise<DrugInfo | null>;
}

/** Prescribe-time allergy seam (ADR-0060) — the app wires this to
 *  clinical.allergicClasses. ADVISORY ONLY: the screen never blocks prescribing. */
export interface AllergyPort {
  allergicClasses(patientId: string): Promise<readonly string[]>;
}

/** Inventory seam — the pharmacy decrements stock through the inventory module's
 *  PUBLISHED interface (FEFO lot selection; never touches inventory's tables). */
export interface InventoryPort {
  /** On-hand quantity of a drug at a stock location (pre-flight sufficiency). */
  availableAt(drugId: string, locationId: string): Promise<number>;
  /** FEFO-issue `quantity` of `drugId` at `locationId`; returns the per-lot
   *  allocations consumed (earliest expiry first). Insufficient stock → error. */
  issueFefo(
    actorId: string,
    drugId: string,
    locationId: string,
    quantity: number,
  ): Promise<Result<readonly DispenseAllocation[], AppError>>;
  /** Deduct a caller-chosen set of exact lots (the manual-allocation override). */
  deductLots(actorId: string, allocations: readonly DispenseAllocation[]): Promise<Result<void, AppError>>;
}

export interface ControlledIssueInput {
  readonly drugId: string;
  readonly lotNo: string;
  readonly quantity: number;
  readonly patientRef: string;
  readonly witnessStaffId: string;
  readonly occurredAt: string;
}

/** Controlled-drugs register seam — a controlled item's dispense posts a witnessed
 *  issue movement to the register via the inventory module's ControlledDrugsService. */
export interface ControlledRegisterPort {
  postIssue(actorId: string, input: ControlledIssueInput): Promise<Result<void, AppError>>;
}
