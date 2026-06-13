// @oxford/billing — basic invoicing & payments (integer fils, no float drift).
// Domain module (audit + core). Packages/instalments/KNET are Phase 5.
export {
  isValidAmount,
  assertAmount,
  lineTotal,
  subtotal,
  taxAmount,
  invoiceTotal,
  balance,
  formatKwd,
  type Fils,
} from "./money.js";
export type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceStatus,
  InvoiceTotals,
  Payment,
  PaymentId,
  PaymentMethod,
  BilingualText,
} from "./types.js";
export { BillingService } from "./billing-service.js";
export { type BillingStore, InMemoryBillingStore } from "./store.js";
export { PgBillingStore } from "./pg-store.js";
export { billingSchema, invoice, payment } from "./schema.js";
