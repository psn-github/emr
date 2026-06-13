// PHASE 4 EXIT GATE — Operations ERP end-to-end, through the tRPC API on a real
// Postgres, exercising every Phase-4 exit-gate criterion in one flow (docs/01
// §E8–E10; roadmap §Phase 4):
//   1. low media stock AUTO-TRIGGERS a requisition;
//   2. a RECEIVED LOT (requisition → PO → goods receipt = real stock) is later
//      TRACEABLE to the embryos it was used on (media-lot recall reachability);
//   3. an overdue incubator calibration raises a BLOCKING alert (and the asset is
//      blocked from use);
//   4. controlled-drug movements RECONCILE (witnessed register, physical count);
// with every mutation on the immutable hash-chained audit log (verified intact).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

// An operations lead with the full Phase-4 permission surface (each route is still
// individually permission-gated; this exercises the happy path across modules).
const ops: Session = {
  sessionId: "s-ops",
  subject: {
    staffId: "ops-1",
    roles: [{
      id: "ops-lead",
      name: "ops-lead",
      permissions: [
        "admin:inventory.read", "admin:inventory.write",
        "financial:procurement.read", "financial:procurement.write", "financial:procurement.approve",
        "embryology:lab.read", "embryology:lab.write",
        "clinical:controlled_drugs.read", "clinical:controlled_drugs.write",
        "admin:assets.read", "admin:assets.write",
      ],
    }],
  },
  mfa: true,
};

const T = "2026-06-20T08:00:00Z";
const ASOF = "2026-06-20T00:00:00Z";

describe.skipIf(!DATABASE_URL)("PHASE 4 EXIT GATE — Operations ERP end-to-end (real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory.supplier, inventory.catalogue_item, inventory.stock_lot, inventory.requisition, inventory.purchase_order, inventory.goods_receipt, inventory.supplier_invoice, inventory.cd_movement, embryology.media_application, assets.asset, assets.maintenance_record, assets.fault_record, audit.audit_log");
    services = buildServices(pool);
    api = appRouter.createCaller({ session: ops, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs the full Operations ERP exit gate in one flow with an intact audit chain", async () => {
    // ── 1. Low media stock AUTO-TRIGGERS a requisition ──────────────────────
    const { supplierId } = await api.inventory.addSupplier({ name: "ART Supplies Co" });
    const { itemId: media } = await api.inventory.addItem({ name: "Blastocyst medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20, preferredSupplierId: supplierId });
    await api.inventory.receiveStock({ itemId: media, lotNo: "SEED", locationId: "lab", quantity: 5, expiryDate: "2027-01-01", receivedAt: T }); // below par 20
    const auto = await api.procurement.autoRequisition({ asOf: T, withinDays: 30, requestedAt: T });
    expect(auto.requisitionId).not.toBeNull();
    expect(auto.lines).toBeGreaterThanOrEqual(1); // a below-par line was raised

    // ── 2. A RECEIVED LOT is later TRACEABLE to embryos ─────────────────────
    const decided = await api.procurement.decideRequisition({ requisitionId: auto.requisitionId!, approve: true });
    expect(decided.status).toBe("approved");
    const po = await api.procurement.createPurchaseOrder({ requisitionId: auto.requisitionId!, supplierId, lines: [{ itemId: media, quantity: 15, unitPriceFils: 4000 }], createdAt: T });
    await api.procurement.receiveGoods({ poId: po.purchaseOrderId, lines: [{ itemId: media, lotNo: "LOT-2026-A", quantity: 15, expiryDate: "2027-06-01", locationId: "lab" }], receivedAt: T });
    expect((await api.inventory.onHand({ itemId: media })).onHand).toBe(20); // 5 seed + 15 received (real stock)

    // the just-received lot is used on two embryos in the lab
    await api.embryology.recordMediaApplication({ cycleId: "cyc-1", embryoId: "embryo-1", itemId: media, lotNo: "LOT-2026-A", step: "blastocyst-culture", quantity: 1, appliedAt: T });
    await api.embryology.recordMediaApplication({ cycleId: "cyc-2", embryoId: "embryo-2", itemId: media, lotNo: "LOT-2026-A", step: "blastocyst-culture", quantity: 1, appliedAt: T });
    const recall = await api.embryology.mediaRecall({ itemId: media, lotNo: "LOT-2026-A" });
    expect([...recall.embryoIds].sort()).toEqual(["embryo-1", "embryo-2"]); // received lot → embryos exposed
    expect([...recall.cycleIds].sort()).toEqual(["cyc-1", "cyc-2"]);

    // ── 3. Overdue incubator calibration raises a BLOCKING alert ────────────
    const { assetId: incubator } = await api.assets.register({ name: "Incubator K1", category: "incubator", locationId: "lab", serialNumber: "INC-K1", critical: true });
    await api.assets.recordMaintenance({ assetId: incubator, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" }); // overdue at ASOF
    const assetAlerts = await api.assets.alerts({ asOf: ASOF, withinDays: 30 });
    expect(assetAlerts.blocking.map((a) => a.assetId)).toContain(incubator); // blocking alert visible
    expect((await api.assets.assertUsable({ assetId: incubator, asOf: ASOF })).usable).toBe(false); // blocked from use

    // ── 4. Controlled-drug movements RECONCILE ──────────────────────────────
    const { itemId: cd } = await api.inventory.addItem({ name: "Pethidine 50mg", category: "drug", unit: "amp", packSize: 1, coldChain: false, controlled: true, parLevel: 0 });
    await api.controlledDrugs.record({ itemId: cd, lotNo: "CD-1", type: "receipt", quantity: 20, reason: "delivery", witnessedBy: "ops-2", occurredAt: T });
    await api.controlledDrugs.record({ itemId: cd, lotNo: "CD-1", type: "issue", quantity: 6, reason: "theatre", patientRef: "pat-1", witnessedBy: "ops-2", occurredAt: T });
    expect((await api.controlledDrugs.balance({ itemId: cd })).balance).toBe(14);
    const recon = await api.controlledDrugs.reconcile({ itemId: cd, lotNo: "CD-1", physicalCount: 14, witnessedBy: "ops-2", reason: "shift count", occurredAt: T });
    expect(recon.matched).toBe(true); // book balance reconciles with the physical count
    expect(recon.discrepancy).toBe(0);

    // ── audit hash-chain intact across every Operations ERP mutation ────────
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });
});
