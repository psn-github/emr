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
} from "./types.js";
export { validatePackage, recognise, type PackageInput, type PackageComponentInput, type Recognition } from "./packages.js";
export { BillingService } from "./billing-service.js";
export { PackageService, type SellResult, type CaptureResult, type ComponentRecognition } from "./package-service.js";
export { type BillingStore, InMemoryBillingStore } from "./store.js";
export { type PackageStore, InMemoryPackageStore } from "./package-store.js";
export { PgBillingStore } from "./pg-store.js";
export { PgPackageStore } from "./package-pg-store.js";
export { billingSchema, invoice, payment, packageDef, patientPackage } from "./schema.js";
