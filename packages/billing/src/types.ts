import type { Id } from "@oxford/core";
import type { Fils } from "./money.js";

// Basic invoicing & payments for the outpatient day. Packages, instalments, and
// KNET/card gateways are Phase 5. Amounts are integer fils.

export type InvoiceId = Id<"Invoice">;
export type PaymentId = Id<"Payment">;

export type InvoiceStatus = "open" | "paid";
export type PaymentMethod = "cash" | "card" | "knet";

export interface BilingualText {
  readonly ar: string;
  readonly en: string;
}

export interface InvoiceLine {
  readonly chargeCode: string;
  readonly description: BilingualText;
  readonly unitAmountFils: Fils;
  readonly quantity: number;
}

export interface Invoice {
  readonly id: InvoiceId;
  readonly patientId: string;
  readonly currency: "KWD";
  readonly lines: readonly InvoiceLine[];
  /** Tax rate in basis points (Kuwait: 0 today; field for regulatory fitness). */
  readonly taxRateBps: number;
  readonly status: InvoiceStatus;
  readonly createdAt: string;
}

export interface Payment {
  readonly id: PaymentId;
  readonly invoiceId: InvoiceId;
  readonly amountFils: Fils;
  readonly method: PaymentMethod;
  readonly takenBy: string;
  readonly receiptNo: string;
  readonly at: string;
}

/** Computed money view of an invoice (subtotal/tax/total/paid/balance). */
export interface InvoiceTotals {
  readonly subtotalFils: Fils;
  readonly taxFils: Fils;
  readonly totalFils: Fils;
  readonly paidFils: Fils;
  readonly balanceFils: Fils;
}
