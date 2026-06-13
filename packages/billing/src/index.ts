// @oxford/billing — basic invoicing & payments (integer fils, no float drift).
// Domain module (audit + core). Packages/instalments/KNET are Phase 5.
export {
  isValidAmount,
  assertAmount,
  lineTotal,
  subtotal,
  balance,
  formatKwd,
  type Fils,
} from "./money.js";
export {
  PAYMENT_METHODS,
  isPaymentMethod,
  type Invoice,
  type InvoiceId,
  type InvoiceLine,
  type InvoiceStatus,
  type InvoiceTotals,
  type Payment,
  type PaymentId,
  type PaymentMethod,
  type PaymentKind,
  type BilingualText,
  type PackageId,
  type PatientPackageId,
  type PackageComponent,
  type Package,
  type PatientPackageComponent,
  type PatientPackage,
  type InstalmentPlanId,
  type Instalment,
  type InstalmentPlan,
  type ChargeId,
  type ChargeSource,
  type ChargeMasterItem,
  type Charge,
} from "./types.js";
export { validatePackage, recognise, type PackageInput, type PackageComponentInput, type Recognition } from "./packages.js";
export { validatePlan, scheduledDue, progressionDecision, type InstalmentInput, type ProgressionDecision } from "./instalments.js";
export { BillingService } from "./billing-service.js";
export { StubPaymentGateway, type PaymentGatewayPort, type GatewayChargeRequest, type GatewayOutcome } from "./gateway.js";
export { GatewayPaymentService } from "./gateway-payment-service.js";
export { PackageService, type SellResult, type CaptureResult, type ComponentRecognition } from "./package-service.js";
export { InstalmentService, type CreatePlanInput, type FinanceGate } from "./instalment-service.js";
export { ChargeCaptureService, type DefineChargeInput, type CaptureChargeInput, type CaptureResult as ChargeCaptureResult } from "./charge-service.js";
export { type BillingStore, InMemoryBillingStore } from "./store.js";
export { type PackageStore, InMemoryPackageStore } from "./package-store.js";
export { type InstalmentStore, InMemoryInstalmentStore } from "./instalment-store.js";
export { type ChargeMasterStore, type ChargeStore, InMemoryChargeMasterStore, InMemoryChargeStore } from "./charge-store.js";
export { PgBillingStore } from "./pg-store.js";
export { PgPackageStore } from "./package-pg-store.js";
export { PgInstalmentStore } from "./instalment-pg-store.js";
export { PgChargeMasterStore, PgChargeStore } from "./charge-pg-store.js";
export { billingSchema, invoice, payment, packageDef, patientPackage, instalmentPlan, chargeMaster, charge } from "./schema.js";
