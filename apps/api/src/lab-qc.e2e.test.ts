// P1 — LAB QC LOG, end-to-end on real Postgres. Proves: QC parameters are config;
// an in-range reading passes and an out-of-range one fails (raising a breach); the
// log filters by equipment + media lot; and the audit chain stays intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedQcParameters, SEED_QC_PARAMETERS } from "@oxford/embryology";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P1 lab QC log (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedQcParameters(pool, SEED_QC_PARAMETERS);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE embryology.qc_reading");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists QC parameters (config) for the entry UI", async () => {
    const params = await services.labQc.listParameters();
    expect(params.map((p) => p.code)).toEqual(expect.arrayContaining(["incubator_co2", "media_ph"]));
  });

  it("records pass/fail readings and serves a filterable, persisted log", async () => {
    const pass = await services.labQc.record("lab-1", { parameterCode: "incubator_temp", value: 37.0, assetRef: "incubator-A", recordedBy: "lab-1", recordedAt: "2026-06-14T08:00:00.000Z" });
    expect(pass.ok && pass.value.status).toBe("pass");

    const fail = await services.labQc.record("lab-1", { parameterCode: "media_ph", value: 6.9, lotNo: "LOT-77", recordedBy: "lab-1", recordedAt: "2026-06-14T09:00:00.000Z", note: "out of range" });
    expect(fail.ok && fail.value.status).toBe("fail");
    expect(fail.ok && fail.value.unit).toBe("pH"); // unit applied from config

    // filters round-trip through Postgres (numeric value preserved)
    const byAsset = await services.labQc.list({ assetRef: "incubator-A" });
    expect(byAsset.map((r) => r.value)).toEqual([37.0]);
    const byLot = await services.labQc.list({ lotNo: "LOT-77" });
    expect(byLot.length).toBe(1);
    expect(byLot[0]!.status).toBe("fail");
    expect((await services.labQc.list({})).length).toBe(2);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
