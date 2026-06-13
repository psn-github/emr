// e2e — procurement / accounts-payable THROUGH the tRPC API on real Postgres
// (docs/01 §E9). Proves: requisition → approval → PO → goods receipt (which
// receives REAL stock) → supplier invoice → 3-way match (matched vs flagged),
// invoice-total validation, auto-requisition from below-par alerts, and RBAC
// (the financial:procurement.* domain is MFA-gated; a clinical role is denied).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const buyer: Session = {
  sessionId: "s-buyer",
  subject: { staffId: "buyer-1", roles: [{ id: "procurement", name: "procurement", permissions: ["financial:procurement.read", "financial:procurement.write", "financial:procurement.approve", "admin:inventory.read", "admin:inventory.write"] }] },
  mfa: true,
};
const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};
const noMfaBuyer: Session = { ...buyer, sessionId: "s-buyer-nomfa", mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

const T = "2026-06-20T08:00:00Z";

describe.skipIf(!DATABASE_URL)("procurement / AP (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let ops: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory.supplier, inventory.catalogue_item, inventory.stock_lot, inventory.requisition, inventory.purchase_order, inventory.goods_receipt, inventory.supplier_invoice");
    services = buildServices(pool);
    ops = appRouter.createCaller({ session: buyer, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("requisition → approve → PO → receive (real stock) → invoice → 3-way MATCH", async () => {
    const { supplierId } = await ops.inventory.addSupplier({ name: "Acme Labs" });
    const { itemId } = await ops.inventory.addItem({ name: "Culture medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20, preferredSupplierId: supplierId });

    const req = await ops.procurement.createRequisition({ lines: [{ itemId, quantity: 10 }], reason: "restock", requestedAt: T });
    expect(req.status).toBe("draft");
    const decided = await ops.procurement.decideRequisition({ requisitionId: req.requisitionId, approve: true });
    expect(decided.status).toBe("approved");

    const po = await ops.procurement.createPurchaseOrder({ requisitionId: req.requisitionId, supplierId, lines: [{ itemId, quantity: 10, unitPriceFils: 5000 }], createdAt: T });
    await ops.procurement.receiveGoods({ poId: po.purchaseOrderId, lines: [{ itemId, lotNo: "L1", quantity: 10, expiryDate: "2027-01-01", locationId: "store" }], receivedAt: T });
    expect((await ops.inventory.onHand({ itemId })).onHand).toBe(10); // GRN received REAL stock

    await ops.procurement.recordSupplierInvoice({ poId: po.purchaseOrderId, lines: [{ itemId, quantity: 10, amountFils: 50000 }], totalFils: 50000, recordedAt: T });
    const match = await ops.procurement.matchInvoice({ poId: po.purchaseOrderId });
    expect(match.matched).toBe(true);
    expect(match.discrepancies).toEqual([]);
  });

  it("flags a 3-way MISMATCH (short delivery + wrong price)", async () => {
    const { supplierId } = await ops.inventory.addSupplier({ name: "Acme Labs" });
    const { itemId } = await ops.inventory.addItem({ name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: false, controlled: false, parLevel: 0, preferredSupplierId: supplierId });
    const po = await ops.procurement.createPurchaseOrder({ supplierId, lines: [{ itemId, quantity: 10, unitPriceFils: 5000 }], createdAt: T });
    await ops.procurement.receiveGoods({ poId: po.purchaseOrderId, lines: [{ itemId, lotNo: "L1", quantity: 8, expiryDate: "2027-01-01", locationId: "store" }], receivedAt: T }); // short
    await ops.procurement.recordSupplierInvoice({ poId: po.purchaseOrderId, lines: [{ itemId, quantity: 8, amountFils: 60000 }], totalFils: 60000, recordedAt: T }); // wrong price
    const match = await ops.procurement.matchInvoice({ poId: po.purchaseOrderId });
    expect(match.matched).toBe(false);
    expect(match.discrepancies.map((d) => d.kind)).toContain("received_qty_mismatch");
  });

  it("rejects an invoice whose total ≠ the sum of its lines", async () => {
    const { supplierId } = await ops.inventory.addSupplier({ name: "Acme Labs" });
    const { itemId } = await ops.inventory.addItem({ name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: false, controlled: false, parLevel: 0 });
    const po = await ops.procurement.createPurchaseOrder({ supplierId, lines: [{ itemId, quantity: 1, unitPriceFils: 100 }], createdAt: T });
    await expectCode(() => ops.procurement.recordSupplierInvoice({ poId: po.purchaseOrderId, lines: [{ itemId, quantity: 1, amountFils: 100 }], totalFils: 999, recordedAt: T }), "BAD_REQUEST");
  });

  it("auto-raises a requisition for below-par items", async () => {
    const { itemId } = await ops.inventory.addItem({ name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: false, controlled: false, parLevel: 20 });
    await ops.inventory.receiveStock({ itemId, lotNo: "L1", locationId: "lab", quantity: 5, expiryDate: "2027-01-01", receivedAt: T });
    const auto = await ops.procurement.autoRequisition({ asOf: T, withinDays: 30, requestedAt: T });
    expect(auto.requisitionId).not.toBeNull();
    expect(auto.lines).toBe(1); // one below-par line (par 20 − onHand 5)
  });

  it("RBAC: a clinical role is denied; an un-stepped-up (no-MFA) buyer is denied", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.procurement.createRequisition({ lines: [{ itemId: "x", quantity: 1 }], reason: "r", requestedAt: T }), "FORBIDDEN");
    const weak = appRouter.createCaller({ session: noMfaBuyer, patient: null, services });
    await expectCode(() => weak.procurement.createRequisition({ lines: [{ itemId: "x", quantity: 1 }], reason: "r", requestedAt: T }), "FORBIDDEN");
  });
});
