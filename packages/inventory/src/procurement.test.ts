import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { decideRequisition, threeWayMatch } from "./procurement.js";
import { ProcurementService } from "./procurement-service.js";
import { InMemoryProcurementStore } from "./procurement-store.js";
import { InventoryService } from "./inventory-service.js";
import { InMemoryStockStore } from "./stock-store.js";
import { InMemoryCatalogueStore } from "./store.js";

describe("procurement logic (pure)", () => {
  it("decides only a draft requisition", () => {
    expect(decideRequisition("draft", true)).toEqual({ ok: true, value: "approved" });
    expect(decideRequisition("draft", false)).toEqual({ ok: true, value: "rejected" });
    const bad = decideRequisition("approved", true);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("inventory.requisition.not_draft");
  });

  it("3-way matches when ordered=received=invoiced (qty) and amounts agree; flags otherwise", () => {
    const okLine = { itemId: "i1", orderedQty: 10, receivedQty: 10, invoicedQty: 10, orderedAmountFils: 50000, invoicedAmountFils: 50000 };
    expect(threeWayMatch([okLine]).matched).toBe(true);
    const m = threeWayMatch([{ ...okLine, receivedQty: 9, invoicedQty: 9, invoicedAmountFils: 60000 }]);
    expect(m.matched).toBe(false);
    expect(m.discrepancies.map((d) => d.kind)).toEqual(["received_qty_mismatch", "amount_mismatch"]);
    // received ≠ invoiced (e.g. invoiced for more than was received)
    const inv = threeWayMatch([{ ...okLine, invoicedQty: 12 }]);
    expect(inv.discrepancies.map((d) => d.kind)).toEqual(["invoiced_qty_mismatch"]);
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const catalogue = new InMemoryCatalogueStore();
  const inventory = new InventoryService(new InMemoryStockStore(), catalogue, audit, events);
  const svc = new ProcurementService(new InMemoryProcurementStore(), inventory, audit, events);
  return { svc, inventory, catalogue };
}

const ITEM = "item-1";
const T = "2026-06-20T08:00:00Z";

describe("ProcurementService", () => {
  it("requisition → approve → PO → receive (real stock) → invoice → 3-way MATCH", async () => {
    const { svc, inventory } = build();
    const req = await svc.createRequisition("buyer-1", [{ itemId: ITEM, quantity: 10 }], "restock", T);
    const approved = await svc.decide("mgr-1", req.id, true);
    expect(approved.ok && approved.value.status).toBe("approved");
    // deciding it again is blocked — not a draft any more (status guard via service)
    const again = await svc.decide("mgr-1", req.id, true);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("inventory.requisition.not_draft");

    const po = await svc.createPurchaseOrder("buyer-1", { requisitionId: req.id, supplierId: "sup-1", lines: [{ itemId: ITEM, quantity: 10, unitPriceFils: 5000 }] }, T);
    expect((await svc.requisition(req.id))!.status).toBe("ordered");

    const grn = await svc.receiveGoods("stores-1", { poId: po.id, lines: [{ itemId: ITEM, lotNo: "L1", quantity: 10, expiryDate: "2027-01-01", locationId: "store" }], receivedAt: T });
    expect(grn.ok).toBe(true);
    expect(await inventory.onHand(ITEM)).toBe(10); // GRN received real stock

    await svc.recordSupplierInvoice("fin-1", { poId: po.id, lines: [{ itemId: ITEM, quantity: 10, amountFils: 50000 }], totalFils: 50000, recordedAt: T });
    const match = await svc.matchInvoice("fin-1", po.id);
    expect(match.ok && match.value.matched).toBe(true);
    expect((await svc.purchaseOrder(po.id))!.status).toBe("matched");
  });

  it("flags a 3-way MISMATCH (short delivery / wrong price)", async () => {
    const { svc } = build();
    const po = await svc.createPurchaseOrder("buyer-1", { supplierId: "sup-1", lines: [{ itemId: ITEM, quantity: 10, unitPriceFils: 5000 }] }, T);
    await svc.receiveGoods("stores-1", { poId: po.id, lines: [{ itemId: ITEM, lotNo: "L1", quantity: 8, expiryDate: "2027-01-01", locationId: "store" }], receivedAt: T }); // short
    await svc.recordSupplierInvoice("fin-1", { poId: po.id, lines: [{ itemId: ITEM, quantity: 8, amountFils: 60000 }], totalFils: 60000, recordedAt: T }); // wrong price
    const match = await svc.matchInvoice("fin-1", po.id);
    expect(match.ok && match.value.matched).toBe(false);
    expect((await svc.purchaseOrder(po.id))!.status).toBe("flagged");
  });

  it("auto-raises a requisition for below-par items", async () => {
    const { svc, inventory, catalogue } = build();
    await catalogue.saveItem({ id: asId<"CatalogueItem">(ITEM), name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20, preferredSupplierId: null });
    await inventory.receive("buyer-1", { itemId: ITEM, lotNo: "L1", locationId: "lab", quantity: 5, expiryDate: "2027-01-01", receivedAt: T });
    const req = await svc.autoRequisitionFromAlerts("buyer-1", new Date(T), 30, T);
    expect(req!.lines).toEqual([{ itemId: ITEM, quantity: 15 }]); // par 20 − onHand 5
    // nothing low → null
    await inventory.receive("buyer-1", { itemId: ITEM, lotNo: "L2", locationId: "lab", quantity: 50, expiryDate: "2027-01-01", receivedAt: T });
    expect(await svc.autoRequisitionFromAlerts("buyer-1", new Date(T), 30, T)).toBeNull();
  });

  it("validates invoice totals and rejects unknown POs / non-draft decisions / incomplete match", async () => {
    const { svc } = build();
    expect((await svc.decide("m", asId<"Requisition">("nope"), true)).ok).toBe(false);
    expect((await svc.receiveGoods("s", { poId: "nope", lines: [], receivedAt: T })).ok).toBe(false);
    expect((await svc.recordSupplierInvoice("f", { poId: "nope", lines: [], totalFils: 0, recordedAt: T })).ok).toBe(false);
    const po = await svc.createPurchaseOrder("buyer-1", { supplierId: "sup-1", lines: [{ itemId: ITEM, quantity: 1, unitPriceFils: 100 }] }, T);
    const badTotal = await svc.recordSupplierInvoice("f", { poId: po.id, lines: [{ itemId: ITEM, quantity: 1, amountFils: 100 }], totalFils: 999, recordedAt: T });
    expect(badTotal.ok).toBe(false);
    if (!badTotal.ok) expect(badTotal.error.detailKey).toBe("inventory.invoice.total_mismatch");
    const noDocs = await svc.matchInvoice("f", po.id); // no GRN/invoice yet
    expect(noDocs.ok).toBe(false);
    if (!noDocs.ok) expect(noDocs.error.detailKey).toBe("inventory.match.incomplete");
    expect((await svc.matchInvoice("f", asId<"PurchaseOrder">("nope"))).ok).toBe(false);
    // a PO citing a non-existent requisition still creates (requisition link skipped)
    const poOrphan = await svc.createPurchaseOrder("buyer-1", { requisitionId: "ghost", supplierId: "sup-1", lines: [{ itemId: ITEM, quantity: 1, unitPriceFils: 100 }] }, T);
    expect(poOrphan.requisitionId).toBe("ghost");
  });
});
