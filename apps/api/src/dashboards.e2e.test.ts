// e2e — operational + financial dashboards THROUGH the tRPC API on real Postgres
// (docs/01 §E12, ADR-0039). Proves the read models compose real data: receivables
// ageing + revenue-by-line + instalment-risk (financial); stock/expiry-risk +
// calibration-compliance (operational). RBAC by reporting domain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const ops: Session = {
  sessionId: "s-ops",
  subject: { staffId: "ops-1", roles: [{ id: "ops", name: "ops", permissions: ["financial:*", "admin:*", "clinical:reports.read"] }] },
  mfa: true,
};
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("dashboards (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.charge, billing.charge_master, billing.instalment_plan, inventory.catalogue_item, inventory.stock_lot, assets.asset, assets.maintenance_record");
    services = buildServices(pool);
    api = appRouter.createCaller({ session: ops, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("financial dashboard: ageing + revenue-by-line + instalment risk from real data", async () => {
    // a charge-captured + invoiced consult (revenue), left partly unpaid (ageing)
    await api.charges.defineCode({ code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    await api.charges.capture({ patientId: "pat-1", chargeCode: "CONSULT", quantity: 4, source: "clinical", occurredAt: "2026-06-13T08:00:00Z" });
    const inv = await api.charges.invoicePatient({ patientId: "pat-1" }); // total 100000
    await api.billing.postPayment({ invoiceId: inv.invoiceId, amountFils: 40000, method: "knet" }); // balance 60000, still open
    // an instalment plan in arrears (deposit unpaid)
    const di = await api.billing.createInvoice({ patientId: "pat-2", lines: [{ chargeCode: "ICSI", description: N("ICSI"), unitAmountFils: 1000000, quantity: 1 }] });
    await api.instalments.createPlan({ patientId: "pat-2", invoiceId: di.invoiceId, depositFils: 200000, instalments: [{ dueDate: "2026-07-01T00:00:00Z", amountFils: 800000 }] });

    const dash = await api.dashboards.financial({ asOf: "2026-06-20T08:00:00Z" });
    // pat-1 consult invoice (60000 open, ~7 days old) + pat-2 ICSI invoice (1,000,000 open)
    expect(dash.ageing.current).toBe(1060000);
    expect(dash.ageing.totalFils).toBe(1060000);
    expect(dash.revenueByLine).toEqual([{ line: "clinical", amountFils: 100000 }]);
    expect(dash.instalmentRisk).toEqual({ plansInArrears: 1, totalArrearsFils: 200000 }); // deposit unpaid
  });

  it("operational dashboard: stock/expiry + calibration compliance from real data", async () => {
    const { itemId } = await api.inventory.addItem({ name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20 });
    await api.inventory.receiveStock({ itemId, lotNo: "L1", locationId: "lab", quantity: 5, expiryDate: "2026-07-01", receivedAt: "2026-06-20T08:00:00Z" }); // below par
    const { assetId } = await api.assets.register({ name: "Incubator", category: "incubator", locationId: "lab", serialNumber: "INC-1", critical: true });
    await api.assets.recordMaintenance({ assetId, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" }); // overdue

    const dash = await api.dashboards.operational({ asOf: "2026-06-20T08:00:00Z", withinDays: 30 });
    expect(dash.stock.criticalStock.some((a) => a.itemId === itemId)).toBe(true);
    expect(dash.calibration.blocking.some((a) => a.assetId === assetId)).toBe(true);
  });

  it("RBAC: the financial dashboard needs the financial reports permission", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.dashboards.financial({ asOf: "2026-06-20T08:00:00Z" }), "FORBIDDEN");
  });
});
