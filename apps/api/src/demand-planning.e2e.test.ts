// P2 — DEMAND PLANNING, end-to-end on real Postgres. Proves: from booked cycle
// counts and the configured per-cycle consumption profiles, the forecast nets
// required media/consumables against real on-hand stock to surface the shortfall
// to procure. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedConsumptionProfiles } from "@oxford/inventory";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P2 demand planning (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedConsumptionProfiles(pool, [
      { cycleType: "dp_icsi", items: [{ itemId: "dp_media", quantityPerCycle: 2 }, { itemId: "dp_icsi_dish", quantityPerCycle: 1 }] },
      { cycleType: "dp_fet", items: [{ itemId: "dp_media", quantityPerCycle: 1 }] },
    ]);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM inventory.stock_lot WHERE item_id LIKE 'dp_%'");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("forecasts media/consumable shortfall from booked cycles netted against stock", async () => {
    // on-hand: 10 media, 0 dishes
    await services.inventory.receive("store-1", { itemId: "dp_media", lotNo: "L1", locationId: "lab", quantity: 10, expiryDate: "2027-01-01", receivedAt: "2026-06-01T00:00:00.000Z" });

    // booked: 5 ICSI + 4 FET → media required = 5*2 + 4*1 = 14; icsi_dish = 5
    const lines = await services.demandPlanning.forecast({ dp_icsi: 5, dp_fet: 4 });
    const byItem = Object.fromEntries(lines.map((l) => [l.itemId, l]));
    expect(byItem.dp_media).toEqual({ itemId: "dp_media", required: 14, onHand: 10, shortfall: 4 });
    expect(byItem.dp_icsi_dish).toEqual({ itemId: "dp_icsi_dish", required: 5, onHand: 0, shortfall: 5 });

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
