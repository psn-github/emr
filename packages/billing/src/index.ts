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
} from "./types.js";
export { BillingService } from "./billing-service.js";
export { type BillingStore, InMemoryBillingStore } from "./store.js";
export { PgBillingStore } from "./pg-store.js";
export { billingSchema, invoice, payment } from "./schema.js";
