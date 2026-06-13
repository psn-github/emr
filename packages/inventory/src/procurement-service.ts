import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  Requisition,
  RequisitionId,
  RequisitionLine,
  PurchaseOrder,
  PurchaseOrderId,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  SupplierInvoice,
  SupplierInvoiceLine,
} from "./types.js";
import type { ProcurementStore } from "./procurement-store.js";
import type { InventoryService } from "./inventory-service.js";
import { decideRequisition, threeWayMatch, type ThreeWayLine, type MatchResult } from "./procurement.js";

export interface CreatePoInput {
  readonly requisitionId?: string;
  readonly supplierId: string;
  readonly lines: readonly PurchaseOrderLine[];
}
export interface ReceiveGoodsInput {
  readonly poId: string;
  readonly lines: readonly GoodsReceiptLine[];
  readonly receivedAt: string;
}
export interface RecordInvoiceInput {
  readonly poId: string;
  readonly lines: readonly SupplierInvoiceLine[];
  readonly totalFils: number;
  readonly recordedAt: string;
}

/**
 * Procurement (docs/01 §E9): requisition → approval → PO → goods receipt (which
 * receives real stock) → supplier invoice → 3-way match → finance. AP money is
 * integer fils (ADR-0027), kept separate from patient billing. Low stock can
 * auto-raise a requisition.
 */
export class ProcurementService {
  constructor(
    private readonly store: ProcurementStore,
    private readonly inventory: InventoryService,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async createRequisition(actorId: string, lines: readonly RequisitionLine[], reason: string, requestedAt: string): Promise<Requisition> {
    const req: Requisition = { id: newId<"Requisition">(), lines, status: "draft", reason, requestedBy: actorId, requestedAt };
    await this.store.saveRequisition(req);
    await this.audit.record({ actorId, entityType: "Requisition", entityId: req.id, action: "CREATE", after: { lines: lines.length, reason } });
    return req;
  }

  /** Raise a requisition for every below-par item (order up to par). Null if none. */
  async autoRequisitionFromAlerts(actorId: string, asOf: Date, withinDays: number, requestedAt: string): Promise<Requisition | null> {
    const alerts = await this.inventory.alerts(asOf, withinDays);
    const lines: RequisitionLine[] = alerts.criticalStock.map((a) => ({ itemId: a.itemId, quantity: a.parLevel - a.onHand }));
    if (lines.length === 0) return null;
    return this.createRequisition(actorId, lines, "auto: low stock", requestedAt);
  }

  async decide(actorId: string, id: RequisitionId, approve: boolean): Promise<Result<Requisition, AppError>> {
    const req = await this.store.getRequisition(id);
    if (req === undefined) return err(notFound("requisition not found", "inventory.requisition.not_found"));
    const next = decideRequisition(req.status, approve);
    if (!next.ok) return err(next.error);
    const updated: Requisition = { ...req, status: next.value };
    await this.store.saveRequisition(updated);
    await this.audit.record({ actorId, entityType: "Requisition", entityId: id, action: "UPDATE", before: { status: req.status }, after: { status: next.value } });
    return ok(updated);
  }

  async createPurchaseOrder(actorId: string, input: CreatePoInput, createdAt: string): Promise<PurchaseOrder> {
    const po: PurchaseOrder = { id: newId<"PurchaseOrder">(), requisitionId: input.requisitionId ?? null, supplierId: input.supplierId, lines: input.lines, status: "open", createdAt };
    await this.store.savePurchaseOrder(po);
    if (input.requisitionId !== undefined) {
      const req = await this.store.getRequisition(input.requisitionId as RequisitionId);
      if (req !== undefined) await this.store.saveRequisition({ ...req, status: "ordered" });
    }
    await this.audit.record({ actorId, entityType: "PurchaseOrder", entityId: po.id, action: "CREATE", after: { supplierId: input.supplierId, lines: input.lines.length } });
    await this.events.emit({ type: "PurchaseOrderCreated", aggregateType: "PurchaseOrder", aggregateId: po.id, data: { supplierId: input.supplierId } });
    return po;
  }

  /** Receive goods against a PO → records the GRN AND receives real stock. */
  async receiveGoods(actorId: string, input: ReceiveGoodsInput): Promise<Result<GoodsReceipt, AppError>> {
    const po = await this.store.getPurchaseOrder(input.poId as PurchaseOrderId);
    if (po === undefined) return err(notFound("purchase order not found", "inventory.po.not_found"));
    const grn: GoodsReceipt = { id: newId<"GoodsReceipt">(), poId: input.poId, lines: input.lines, receivedAt: input.receivedAt, receivedBy: actorId };
    await this.store.saveGoodsReceipt(grn);
    for (const line of input.lines) {
      await this.inventory.receive(actorId, { itemId: line.itemId, lotNo: line.lotNo, locationId: line.locationId, quantity: line.quantity, expiryDate: line.expiryDate, receivedAt: input.receivedAt });
    }
    await this.store.savePurchaseOrder({ ...po, status: "received" });
    await this.audit.record({ actorId, entityType: "GoodsReceipt", entityId: grn.id, action: "CREATE", after: { poId: input.poId, lines: input.lines.length } });
    await this.events.emit({ type: "GoodsReceived", aggregateType: "PurchaseOrder", aggregateId: input.poId, data: { lines: input.lines.length } });
    return ok(grn);
  }

  async recordSupplierInvoice(actorId: string, input: RecordInvoiceInput): Promise<Result<SupplierInvoice, AppError>> {
    const po = await this.store.getPurchaseOrder(input.poId as PurchaseOrderId);
    if (po === undefined) return err(notFound("purchase order not found", "inventory.po.not_found"));
    const sum = input.lines.reduce((s, l) => s + l.amountFils, 0);
    if (sum !== input.totalFils) return err(validationError("invoice total does not equal the sum of its lines", "inventory.invoice.total_mismatch"));
    const invoice: SupplierInvoice = { id: newId<"SupplierInvoice">(), poId: input.poId, lines: input.lines, totalFils: input.totalFils, recordedAt: input.recordedAt };
    await this.store.saveSupplierInvoice(invoice);
    await this.audit.record({ actorId, entityType: "SupplierInvoice", entityId: invoice.id, action: "CREATE", after: { poId: input.poId, totalFils: input.totalFils } });
    return ok(invoice);
  }

  /** Run the 3-way match for a PO (against its latest GRN + invoice); set status. */
  async matchInvoice(actorId: string, poId: PurchaseOrderId): Promise<Result<MatchResult, AppError>> {
    const po = await this.store.getPurchaseOrder(poId);
    if (po === undefined) return err(notFound("purchase order not found", "inventory.po.not_found"));
    const grns = await this.store.goodsReceiptsForPo(poId);
    const invoices = await this.store.supplierInvoicesForPo(poId);
    if (grns.length === 0 || invoices.length === 0) {
      return err(validationError("a goods receipt and a supplier invoice are required to match", "inventory.match.incomplete"));
    }
    const receivedQty = (itemId: string): number => grns.flatMap((g) => g.lines).filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
    const invoicedQty = (itemId: string): number => invoices.flatMap((i) => i.lines).filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
    const invoicedAmount = (itemId: string): number => invoices.flatMap((i) => i.lines).filter((l) => l.itemId === itemId).reduce((s, l) => s + l.amountFils, 0);
    const lines: ThreeWayLine[] = po.lines.map((l) => ({
      itemId: l.itemId,
      orderedQty: l.quantity,
      receivedQty: receivedQty(l.itemId),
      invoicedQty: invoicedQty(l.itemId),
      orderedAmountFils: l.quantity * l.unitPriceFils,
      invoicedAmountFils: invoicedAmount(l.itemId),
    }));
    const result = threeWayMatch(lines);
    await this.store.savePurchaseOrder({ ...po, status: result.matched ? "matched" : "flagged" });
    await this.audit.record({ actorId, entityType: "PurchaseOrder", entityId: poId, action: "UPDATE", after: { matched: result.matched, discrepancies: result.discrepancies.length } });
    await this.events.emit({ type: result.matched ? "InvoiceMatched" : "InvoiceFlagged", aggregateType: "PurchaseOrder", aggregateId: poId, data: { discrepancies: result.discrepancies.length } });
    return ok(result);
  }

  requisition(id: RequisitionId): Promise<Requisition | undefined> {
    return this.store.getRequisition(id);
  }
  purchaseOrder(id: PurchaseOrderId): Promise<PurchaseOrder | undefined> {
    return this.store.getPurchaseOrder(id);
  }
}
