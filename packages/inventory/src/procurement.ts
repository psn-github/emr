import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Procurement logic (pure, 100%) — requisition approval transitions + the 3-way
// match (PO vs GRN vs supplier-invoice). AP money is integer fils (ADR-0027).
// The match is exact today; a tolerance is configuration for later.

export type RequisitionStatus = "draft" | "approved" | "rejected" | "ordered";

/** Approve or reject a draft requisition. Only a draft may be decided. */
export function decideRequisition(status: RequisitionStatus, approve: boolean): Result<RequisitionStatus, AppError> {
  if (status !== "draft") {
    return err(validationError(`requisition is ${status}, not draft`, "inventory.requisition.not_draft"));
  }
  return ok(approve ? "approved" : "rejected");
}

/** One item compared across the purchase order, goods receipt, and invoice. */
export interface ThreeWayLine {
  readonly itemId: string;
  readonly orderedQty: number;
  readonly receivedQty: number;
  readonly invoicedQty: number;
  readonly orderedAmountFils: number;
  readonly invoicedAmountFils: number;
}

export type DiscrepancyKind = "received_qty_mismatch" | "invoiced_qty_mismatch" | "amount_mismatch";

export interface Discrepancy {
  readonly itemId: string;
  readonly kind: DiscrepancyKind;
}

export interface MatchResult {
  readonly matched: boolean;
  readonly discrepancies: readonly Discrepancy[];
}

/** 3-way match: ordered = received = invoiced (qty) and ordered = invoiced
 *  (amount), per line. Any divergence is flagged; finance only pays a match. */
export function threeWayMatch(lines: readonly ThreeWayLine[]): MatchResult {
  const discrepancies: Discrepancy[] = [];
  for (const l of lines) {
    if (l.orderedQty !== l.receivedQty) discrepancies.push({ itemId: l.itemId, kind: "received_qty_mismatch" });
    if (l.receivedQty !== l.invoicedQty) discrepancies.push({ itemId: l.itemId, kind: "invoiced_qty_mismatch" });
    if (l.orderedAmountFils !== l.invoicedAmountFils) discrepancies.push({ itemId: l.itemId, kind: "amount_mismatch" });
  }
  return { matched: discrepancies.length === 0, discrepancies };
}
