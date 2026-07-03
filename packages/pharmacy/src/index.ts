// @oxford/pharmacy — Ground-floor dispensing (docs/PHASE8_PLAN §8.1, ADR-0066).
// Domain module: core + audit only. A FORMULARY-ONLY prescription (allergy
// screened, advisory) → the dispensing queue → dispense (FEFO stock decrement via
// the inventory seam; cold-chain asserted; controlled items post a witnessed
// movement to the controlled-drugs register) → markReady → markCollected.
// `PharmacyService.isPrescriptionFulfilled` implements the perioperative
// PharmacyPort so the L2 discharge gate consumes real fulfilment. All integration
// is via ports defined here and implemented in the app layer (module boundaries).
export type {
  PrescriptionId,
  DispenseId,
  DoseInstruction,
  PrescriptionItemInput,
  PrescriptionItem,
  PrescriptionStatus,
  AllergyWarning,
  Prescription,
  DispenseAllocation,
  Dispense,
} from "./types.js";
export type {
  DrugInfo,
  FormularyPort,
  AllergyPort,
  InventoryPort,
  ControlledIssueInput,
  ControlledRegisterPort,
} from "./ports.js";
export {
  type PrescriptionAction,
  nextStatus,
  validatePrescriptionItems,
  screenPrescription,
  controlledItems,
  assertColdChainHandled,
  assertWitnessForControlled,
  assertSufficientStock,
  totalAllocated,
  assertAllocationsCoverItems,
} from "./dispensing.js";
export { type PharmacyStore, InMemoryPharmacyStore } from "./store.js";
export { PgPharmacyStore } from "./pg-store.js";
export {
  PharmacyService,
  type RaisePrescriptionInput,
  type DispenseInput,
  type PharmacyConfig,
} from "./pharmacy-service.js";
export { pharmacySchema, prescription, dispense } from "./schema.js";
