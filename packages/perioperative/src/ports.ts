import type { Result, AppError } from "@oxford/core";
import type { CareLocationKind } from "./journey.js";

// Facility/flow seam (ADR-0023). The app wires this to @oxford/facility's
// FacilityService/FlowService. The perioperative module never touches the bed
// tables directly — it asks the seam to place a patient into a care location of a
// given kind (allocating a free bed where applicable) or to release them on
// discharge/cancel. Capacity is enforced HERE (a placement fails if no bed/
// theatre is free), so the journey is capacity-aware without cross-module access.

/** Scheduling seam — books the theatre + staff on the SHARED resource calendar
 *  (conflict-aware) so theatre cases don't double-book a shared resource. Wired
 *  to @oxford/scheduling in the app. */
export interface BookTheatreSlotInput {
  readonly typeId: string;
  readonly patientId: string;
  readonly surgeonResourceId: string;
  readonly resourceIds: readonly string[];
  readonly start: string;
  readonly end: string;
}
export interface SchedulingPort {
  bookTheatreSlot(actorId: string, input: BookTheatreSlotInput): Promise<Result<{ appointmentId: string }, AppError>>;
}

/** WHO checklist seam — the journey consults this to BLOCK theatre entry/exit
 *  until the checklist phases are complete (docs/01 §E7). Implemented by the
 *  WhoChecklistService; injected into the perioperative journey. */
export interface ChecklistGate {
  assertMayEnterTheatre(encounterId: string): Promise<Result<void, AppError>>;
  assertMayLeaveTheatre(encounterId: string): Promise<Result<void, AppError>>;
}

/** Inventory seam (ADR-0024) — deduct consumables/implants from stock at point
 *  of use. A stub records the deduction now; the real @oxford/inventory module
 *  is Phase 4. */
export interface InventoryDeductItem {
  readonly code: string;
  readonly lotNo: string;
  readonly quantity: number;
}
export interface InventoryPort {
  deduct(actorId: string, items: readonly InventoryDeductItem[]): Promise<Result<void, AppError>>;
}

/** Billing seam — raise the consumable/implant charges via @oxford/billing
 *  (integer fils stays in billing). Returns the invoice id. */
export interface ConsumableChargeLine {
  readonly chargeCode: string;
  readonly descriptionEn: string;
  readonly descriptionAr: string;
  readonly unitAmountFils: number;
  readonly quantity: number;
}
export interface PerioperativeBillingPort {
  raiseConsumableCharges(actorId: string, patientId: string, lines: readonly ConsumableChargeLine[]): Promise<string>;
}

/** Pharmacy seam (ADR-0025) — has the discharge prescription been fulfilled /
 *  handed over by the Ground-floor pharmacy? Stub now; real with E8 pharmacy. */
export interface PharmacyPort {
  isPrescriptionFulfilled(encounterId: string): Promise<boolean>;
}

/** Discharge seam — the journey consults this to BLOCK discharge from L2 until
 *  the prescription is fulfilled + a follow-up is booked. */
export interface DischargeGate {
  assertMayDischarge(encounterId: string): Promise<Result<void, AppError>>;
}

export interface FacilityFlowPort {
  /** Place the patient into a free location of `kind` with the given flow status.
   *  Returns the node used, or a capacity error if none is free. */
  place(actorId: string, patientId: string, kind: CareLocationKind, status: string): Promise<Result<{ locationNodeId: string }, AppError>>;
  /** Release the patient (free their bed) on discharge or cancellation. */
  release(actorId: string, patientId: string, reason: string): Promise<Result<void, AppError>>;
}
