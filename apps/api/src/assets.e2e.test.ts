// e2e — asset & biomedical-equipment management THROUGH the tRPC API on real
// Postgres (docs/01 §E10). Proves the patient-safety control (ADR-0029): a
// CRITICAL asset (incubator) with overdue/missing calibration is BLOCKED from
// use and surfaces in the blocking-alerts list; recording a current calibration
// clears the block; a non-critical overdue asset is alert-only; faults log
// downtime; RBAC keeps the register in the operations domain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const engineer: Session = {
  sessionId: "s-eng",
  subject: { staffId: "eng-1", roles: [{ id: "biomed", name: "biomed", permissions: ["admin:assets.read", "admin:assets.write"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-front",
  subject: { staffId: "front-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
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

const ASOF = "2026-06-20T00:00:00Z";

describe.skipIf(!DATABASE_URL)("asset register + PPM/calibration (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let eng: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE assets.asset, assets.maintenance_record, assets.fault_record");
    services = buildServices(pool);
    eng = appRouter.createCaller({ session: engineer, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("blocks a critical incubator with overdue calibration; a current calibration clears it", async () => {
    const { assetId } = await eng.assets.register({ name: "Incubator A", category: "incubator", locationId: "lab", serialNumber: "INC-1", critical: true });

    // never calibrated → blocked + appears in blocking alerts
    expect((await eng.assets.assertUsable({ assetId, asOf: ASOF })).usable).toBe(false);
    let alerts = await eng.assets.alerts({ asOf: ASOF, withinDays: 30 });
    expect(alerts.blocking.map((a) => a.assetId)).toContain(assetId);

    // overdue calibration → still blocked
    await eng.assets.recordMaintenance({ assetId, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" });
    expect((await eng.assets.assertUsable({ assetId, asOf: ASOF })).usable).toBe(false);
    expect((await eng.assets.status({ assetId, asOf: ASOF })).calibration).toBe("overdue");

    // current calibration → usable, off the blocking list
    await eng.assets.recordMaintenance({ assetId, type: "calibration", performedAt: "2026-06-15T00:00:00Z", nextDueDate: "2026-12-15T00:00:00Z" });
    expect((await eng.assets.assertUsable({ assetId, asOf: ASOF })).usable).toBe(true);
    alerts = await eng.assets.alerts({ asOf: ASOF, withinDays: 30 });
    expect(alerts.blocking.map((a) => a.assetId)).not.toContain(assetId);
  });

  it("treats a non-critical overdue asset as alert-only (usable)", async () => {
    const { assetId } = await eng.assets.register({ name: "Office printer", category: "other", locationId: "office", serialNumber: "PR-1", critical: false });
    await eng.assets.recordMaintenance({ assetId, type: "calibration", performedAt: "2025-12-01T00:00:00Z", nextDueDate: "2026-06-01T00:00:00Z" });
    expect((await eng.assets.assertUsable({ assetId, asOf: ASOF })).usable).toBe(true);
    const alerts = await eng.assets.alerts({ asOf: ASOF, withinDays: 30 });
    expect(alerts.nonBlocking.map((a) => a.assetId)).toContain(assetId);
    expect(alerts.blocking).toHaveLength(0);
  });

  it("logs a fault with downtime and rejects a maintenance due-date before the work", async () => {
    const { assetId } = await eng.assets.register({ name: "Laser", category: "laser", locationId: "l1", serialNumber: "LZ-1", critical: false });
    const { faultId } = await eng.assets.reportFault({ assetId, reportedAt: "2026-06-18T00:00:00Z", description: "won't power on", severity: "major" });
    const res = await eng.assets.resolveFault({ faultId, resolvedAt: "2026-06-19T00:00:00Z", downtimeMinutes: 600 });
    expect(res.downtimeMinutes).toBe(600);
    await expectCode(() => eng.assets.recordMaintenance({ assetId, type: "calibration", performedAt: "2026-06-20T00:00:00Z", nextDueDate: "2026-06-19T00:00:00Z" }), "BAD_REQUEST");
  });

  it("RBAC: a non-operations role cannot touch the asset register", async () => {
    const { assetId } = await eng.assets.register({ name: "Scanner", category: "scanner", locationId: "l3", serialNumber: "SC-1", critical: true });
    const front = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => front.assets.alerts({ asOf: ASOF, withinDays: 30 }), "FORBIDDEN");
    await expectCode(() => front.assets.recordMaintenance({ assetId, type: "calibration", performedAt: ASOF, nextDueDate: "2026-12-01T00:00:00Z" }), "FORBIDDEN");
  });
});
