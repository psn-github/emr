import type { Pool } from "pg";
import { asId } from "@oxford/core";
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

/** Postgres-backed ProcurementStore. */
export class PgProcurementStore implements ProcurementStore {
  constructor(private readonly pool: Pool) {}

  async saveRequisition(r: Requisition): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.requisition (id, lines, status, reason, requested_by, requested_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [r.id, JSON.stringify(r.lines), r.status, r.reason, r.requestedBy, r.requestedAt],
    );
  }
  async getRequisition(id: RequisitionId): Promise<Requisition | undefined> {
    const r = await this.pool.query<ReqRow>("SELECT * FROM inventory.requisition WHERE id = $1", [id]);
    return r.rows[0] ? reqFrom(r.rows[0]) : undefined;
  }
  async savePurchaseOrder(po: PurchaseOrder): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.purchase_order (id, requisition_id, supplier_id, lines, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [po.id, po.requisitionId, po.supplierId, JSON.stringify(po.lines), po.status, po.createdAt],
    );
  }
  async getPurchaseOrder(id: PurchaseOrderId): Promise<PurchaseOrder | undefined> {
    const r = await this.pool.query<PoRow>("SELECT * FROM inventory.purchase_order WHERE id = $1", [id]);
    return r.rows[0] ? poFrom(r.rows[0]) : undefined;
  }
  async saveGoodsReceipt(g: GoodsReceipt): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.goods_receipt (id, po_id, lines, received_at, received_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [g.id, g.poId, JSON.stringify(g.lines), g.receivedAt, g.receivedBy],
    );
  }
  async goodsReceiptsForPo(poId: string): Promise<readonly GoodsReceipt[]> {
    const r = await this.pool.query<GrnRow>("SELECT * FROM inventory.goods_receipt WHERE po_id = $1 ORDER BY received_at", [poId]);
    return r.rows.map(grnFrom);
  }
  async saveSupplierInvoice(i: SupplierInvoice): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.supplier_invoice (id, po_id, lines, total_fils, recorded_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [i.id, i.poId, JSON.stringify(i.lines), i.totalFils, i.recordedAt],
    );
  }
  async supplierInvoicesForPo(poId: string): Promise<readonly SupplierInvoice[]> {
    const r = await this.pool.query<InvRow>("SELECT * FROM inventory.supplier_invoice WHERE po_id = $1 ORDER BY recorded_at", [poId]);
    return r.rows.map(invFrom);
  }
}

interface ReqRow { id: string; lines: RequisitionLine[]; status: string; reason: string; requested_by: string; requested_at: Date }
interface PoRow { id: string; requisition_id: string | null; supplier_id: string; lines: PurchaseOrderLine[]; status: string; created_at: Date }
interface GrnRow { id: string; po_id: string; lines: GoodsReceiptLine[]; received_at: Date; received_by: string }
interface InvRow { id: string; po_id: string; lines: SupplierInvoiceLine[]; total_fils: number; recorded_at: Date }

const iso = (d: Date): string => new Date(d).toISOString();
function reqFrom(r: ReqRow): Requisition {
  return { id: asId<"Requisition">(r.id), lines: r.lines, status: r.status as Requisition["status"], reason: r.reason, requestedBy: r.requested_by, requestedAt: iso(r.requested_at) };
}
function poFrom(r: PoRow): PurchaseOrder {
  return { id: asId<"PurchaseOrder">(r.id), requisitionId: r.requisition_id, supplierId: r.supplier_id, lines: r.lines, status: r.status as PurchaseOrder["status"], createdAt: iso(r.created_at) };
}
function grnFrom(r: GrnRow): GoodsReceipt {
  return { id: asId<"GoodsReceipt">(r.id), poId: r.po_id, lines: r.lines, receivedAt: iso(r.received_at), receivedBy: r.received_by };
}
function invFrom(r: InvRow): SupplierInvoice {
  return { id: asId<"SupplierInvoice">(r.id), poId: r.po_id, lines: r.lines, totalFils: r.total_fils, recordedAt: iso(r.recorded_at) };
}
