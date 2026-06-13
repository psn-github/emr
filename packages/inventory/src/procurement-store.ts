import type { Requisition, RequisitionId, PurchaseOrder, PurchaseOrderId, GoodsReceipt, SupplierInvoice } from "./types.js";

export interface ProcurementStore {
  saveRequisition(r: Requisition): Promise<void>;
  getRequisition(id: RequisitionId): Promise<Requisition | undefined>;
  savePurchaseOrder(po: PurchaseOrder): Promise<void>;
  getPurchaseOrder(id: PurchaseOrderId): Promise<PurchaseOrder | undefined>;
  saveGoodsReceipt(g: GoodsReceipt): Promise<void>;
  goodsReceiptsForPo(poId: string): Promise<readonly GoodsReceipt[]>;
  saveSupplierInvoice(i: SupplierInvoice): Promise<void>;
  supplierInvoicesForPo(poId: string): Promise<readonly SupplierInvoice[]>;
}

export class InMemoryProcurementStore implements ProcurementStore {
  private readonly requisitions = new Map<string, Requisition>();
  private readonly pos = new Map<string, PurchaseOrder>();
  private readonly grns: GoodsReceipt[] = [];
  private readonly invoices: SupplierInvoice[] = [];

  async saveRequisition(r: Requisition): Promise<void> {
    this.requisitions.set(r.id, r);
  }
  async getRequisition(id: RequisitionId): Promise<Requisition | undefined> {
    return this.requisitions.get(id);
  }
  async savePurchaseOrder(po: PurchaseOrder): Promise<void> {
    this.pos.set(po.id, po);
  }
  async getPurchaseOrder(id: PurchaseOrderId): Promise<PurchaseOrder | undefined> {
    return this.pos.get(id);
  }
  async saveGoodsReceipt(g: GoodsReceipt): Promise<void> {
    this.grns.push(g);
  }
  async goodsReceiptsForPo(poId: string): Promise<readonly GoodsReceipt[]> {
    return this.grns.filter((g) => g.poId === poId);
  }
  async saveSupplierInvoice(i: SupplierInvoice): Promise<void> {
    this.invoices.push(i);
  }
  async supplierInvoicesForPo(poId: string): Promise<readonly SupplierInvoice[]> {
    return this.invoices.filter((i) => i.poId === poId);
  }
}
