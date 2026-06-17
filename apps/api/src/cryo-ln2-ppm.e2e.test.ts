// P2 — LN₂ CONSUMPTION + TANK PPM LINKAGE, end-to-end on real Postgres. Proves:
// a cryotank links to its Asset record; LN₂ top-ups are logged and consumption is
// read back over a window; the tank's PPM status is resolved live from the asset
// module (overdue surfaced) — audit chain intact. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P2 LN₂ consumption + tank PPM linkage (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE cryostore.ln_fill, cryostore.tank");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("logs LN₂ fills + reports consumption, and resolves overdue PPM from the linked asset", async () => {
    // a cryotank asset with an overdue PPM
    const asset = await services.assets.registerAsset("eng-1", { name: "Cryotank 1", category: "cryotank", locationId: "lab", serialNumber: "CT-1", critical: true });
    await services.assets.recordMaintenance("eng-1", { assetId: asset.id, type: "ppm", performedAt: "2025-12-01T00:00:00.000Z", nextDueDate: "2026-01-01T00:00:00.000Z" });

    const tank = await services.cryostore.registerTank("eng-1", "Tank A", asset.id);

    // LN₂ top-ups
    await services.cryostore.recordLnFill("eng-1", tank.id, 12.5, "2026-06-05T08:00:00.000Z");
    await services.cryostore.recordLnFill("eng-1", tank.id, 10, "2026-06-12T08:00:00.000Z");
    await services.cryostore.recordLnFill("eng-1", tank.id, 99, "2026-05-01T08:00:00.000Z"); // out of window

    const usage = await services.cryostore.lnConsumption(tank.id, "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.000Z");
    expect(usage.litres).toBe(22.5);
    expect(usage.fills).toBe(2);

    // PPM status resolved live from the asset module → overdue (next due 2026-01-01)
    const ppm = await services.cryostore.tankPpmStatus(tank.id);
    expect(ppm.ok && ppm.value.assetRef).toBe(asset.id);
    expect(ppm.ok && ppm.value.overdue).toBe(true);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
