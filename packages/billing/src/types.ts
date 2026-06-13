import type { Id } from "@oxford/core";
import type { Fils } from "./money.js";

// Invoicing & payments. Amounts are integer fils. NO CASH (ADR-0034): payments
// are KNET or credit card only — cash is structurally absent. NO TAX (ADR-0035):
// there is no tax field, line, or calculation; an invoice total equals subtotal.

export type InvoiceId = Id<"Invoice">;
export type PaymentId = Id<"Payment">;
export type PackageId = Id<"Package">;
export type PatientPackageId = Id<"PatientPackage">;
export type InstalmentPlanId = Id<"InstalmentPlan">;

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
  /** The payment gateway's transaction reference (empty for manual/legacy rows). */
  readonly gatewayRef: string;
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

// Packages & cycle bundles (ADR-0037). A Package is the versioned config; a
// PatientPackage is a sold instance carrying the per-component recognition ledger.

export interface PackageComponent {
  readonly chargeCode: string;
  readonly description: BilingualText;
  readonly includedQuantity: number;
  readonly unitAmountFils: Fils;
}
export interface Package {
  readonly id: PackageId;
  readonly code: string;
  readonly name: BilingualText;
  readonly version: number;
  readonly components: readonly PackageComponent[];
  readonly priceFils: Fils;
  readonly active: boolean;
}

/** A sold package component with how much of its inclusion has been consumed. */
export interface PatientPackageComponent extends PackageComponent {
  readonly consumedQuantity: number;
}
export interface PatientPackage {
  readonly id: PatientPackageId;
  readonly packageId: string;
  readonly packageVersion: number;
  readonly patientId: string;
  readonly priceFils: Fils;
  /** The invoice raised for the package price at point of sale. */
  readonly invoiceId: string;
  readonly components: readonly PatientPackageComponent[];
  readonly status: "active" | "cancelled";
  readonly soldAt: string;
}

// Deposits & instalment plans (ADR-0038). A plan pays down an invoice; the
// invoice's net payments are the source of truth for "paid".
export interface Instalment {
  readonly dueDate: string;
  readonly amountFils: Fils;
}
export interface InstalmentPlan {
  readonly id: InstalmentPlanId;
  readonly patientId: string;
  readonly invoiceId: string;
  readonly totalFils: Fils;
  readonly depositFils: Fils;
  readonly instalments: readonly Instalment[];
  readonly status: "active" | "cancelled";
  readonly createdAt: string;
}
