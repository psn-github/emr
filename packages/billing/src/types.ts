import type { Id } from "@oxford/core";
import type { Fils } from "./money.js";

// Invoicing & payments. Amounts are integer fils. NO CASH (ADR-0034): payments
// are KNET or credit card only — cash is structurally absent. NO TAX (ADR-0035):
// there is no tax field, line, or calculation; an invoice total equals subtotal.

export type InvoiceId = Id<"Invoice">;
export type PaymentId = Id<"Payment">;

export type InvoiceStatus = "open" | "paid";

/** The ONLY payment methods the clinic accepts — cash is structurally absent. */
export const PAYMENT_METHODS = ["knet", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Runtime guard — the server's structural rejection of any non-allowed method
 *  (e.g. a "cash" string arriving at the untyped API boundary). */
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** A ledger entry against an invoice: a payment in, or a refund out. */
export type PaymentKind = "payment" | "refund";

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
  readonly status: InvoiceStatus;
  readonly createdAt: string;
}

export interface Payment {
  readonly id: PaymentId;
  readonly invoiceId: InvoiceId;
  /** payment (money in) or refund (money out) — both append-only ledger entries. */
  readonly kind: PaymentKind;
  readonly amountFils: Fils;
  readonly method: PaymentMethod;
  readonly takenBy: string;
  readonly receiptNo: string;
  /** Refund reason (empty for payments). */
  readonly reason: string;
  readonly at: string;
}

/** Computed money view of an invoice. No tax (ADR-0035): total = subtotal; paid
 *  is net of refunds. */
export interface InvoiceTotals {
  readonly subtotalFils: Fils;
  readonly totalFils: Fils;
  readonly paidFils: Fils;
  readonly balanceFils: Fils;
}
