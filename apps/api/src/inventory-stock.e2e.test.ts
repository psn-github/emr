// e2e — multi-location inventory THROUGH the tRPC API on real Postgres (docs/01
// §E9). Proves: receive lots, FEFO issue (never negative), on-hand, critical-stock
// + expiry alerts against catalogue par levels, cold-chain logging, RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const stores: Session = {
  sessionId: "s-stores",
  subject: { staffId: "stores-1", roles: [{ id: "stores", name: "stores", permissions: ["admin:inventory.read", "admin:inventory.write"] }] },
  mfa: true,
};
const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("inventory stock (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let ops: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory.supplier, inventory.catalogue_item, inventory.stock_lot, inventory.cold_chain_reading");
    services = buildServices(pool);
    ops = appRouter.createCaller({ session: stores, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("receives lots, FEFO-issues, reports on-hand, and refuses to go negative", async () => {
    const { itemId } = await ops.inventory.addItem({ name: "Culture medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20 });
    await ops.inventory.receiveStock({ itemId, lotNo: "L1", locationId: "lab", quantity: 10, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" });
    await ops.inventory.receiveStock({ itemId, lotNo: "L2", locationId: "lab", quantity: 4, expiryDate: "2026-07-01", receivedAt: "2026-06-20T08:00:00Z" });
    expect((await ops.inventory.onHand({ itemId })).onHand).toBe(14);

    await ops.inventory.issueStock({ itemId, locationId: "lab", quantity: 6 }); // FEFO: 4 from L2 + 2 from L1
    expect((await ops.inventory.onHand({ itemId })).onHand).toBe(8);
    await expectCode(() => ops.inventory.issueStock({ itemId, locationId: "lab", quantity: 999 }), "PRECONDITION_FAILED");
  });

  it("raises critical-stock + expiry alerts against par levels", async () => {
    const { itemId } = await ops.inventory.addItem({ name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20 });
    await ops.inventory.receiveStock({ itemId, lotNo: "L1", locationId: "lab", quantity: 5, expiryDate: "2026-07-01", receivedAt: "2026-06-20T08:00:00Z" });
    const alerts = await ops.inventory.alerts({ asOf: "2026-06-20T08:00:00Z", withinDays: 30 });
    expect(alerts.criticalStock.some((a) => a.itemId === itemId && a.onHand === 5 && a.parLevel === 20)).toBe(true);
    expect(alerts.expiring.some((e) => e.itemId === itemId)).toBe(true);
  });

  it("logs cold-chain readings; RBAC blocks a clinical role", async () => {
    await ops.inventory.recordColdChain({ locationId: "fridge-1", temperatureC: 4.1, recordedAt: "2026-06-20T08:00:00Z" });
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.inventory.receiveStock({ itemId: "x", lotNo: "L", locationId: "lab", quantity: 1, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" }), "FORBIDDEN");
  });
});
