// @oxford/pharmacy — prescriptions + theatre drugs (docs/PHASE8_PLAN §8.1, ADR-0069
// which supersedes the dispensing model of ADR-0066). Domain module: core + audit
// only. Two flows:
//   (1) PRESCRIPTIONS (external fulfilment, NO clinic stock): a FORMULARY-ONLY
//       prescription (allergy screened, advisory) → issued (printed) → external
//       fulfilment confirmation. `isPrescriptionFulfilled` implements the
//       perioperative PharmacyPort so the L2 discharge gate consumes the confirmation.
//   (2) THEATRE DRUG ADMINISTRATION (in-house stock): FEFO stock decrement via the
//       inventory seam; controlled items post a witnessed movement to the controlled-
//       drugs register; cold-chain asserted. Composite (anaesthesia + stim) formulary.
// All integration is via ports defined here and implemented in the app layer.
export type {
  PrescriptionId,
  TheatreAdministrationId,
  DoseInstruction,
  PrescriptionItemInput,
  PrescriptionItem,
  PrescriptionStatus,
  AllergyWarning,
  Prescription,
  TheatreDrugInput,
  TheatreDrugItem,
  StockAllocation,
  TheatreDrugAdministration,
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
  type DrugLine,
  nextStatus,
  validatePrescriptionItems,
  screenPrescription,
  validateTheatreDrugs,
  controlledDrugItems,
  assertColdChainHandled,
  assertWitnessForControlled,
  assertSufficientStock,
  totalAllocated,
  assertAllocationsCoverItems,
} from "./administration.js";
export { type PharmacyStore, InMemoryPharmacyStore } from "./store.js";
export { PgPharmacyStore } from "./pg-store.js";
export {
  PharmacyService,
  type RaisePrescriptionInput,
  type RecordExternalFulfilmentInput,
  type AdministerTheatreDrugsInput,
  type PharmacyConfig,
} from "./pharmacy-service.js";
export { pharmacySchema, prescription, theatreDrugAdministration } from "./schema.js";
