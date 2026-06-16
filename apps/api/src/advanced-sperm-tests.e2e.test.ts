// P1 — ADVANCED SPERM TESTS (DNA fragmentation etc.), end-to-end on real Postgres.
// Proves: test specs are config; a value is interpreted (normal/abnormal) against
// its spec, persisted, and an abnormal result is flagged — with the audit chain
// intact. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedAdvancedTestSpecs, SEED_ADVANCED_TEST_SPECS } from "@oxford/andrology";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const PATIENT = "pat-andro-1";

describe.skipIf(!DATABASE_URL)("P1 advanced sperm tests (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedAdvancedTestSpecs(pool, SEED_ADVANCED_TEST_SPECS);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE andrology.advanced_sperm_test");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists specs (config) and captures DFI results with interpretation", async () => {
    expect((await services.andrology.listAdvancedTestSpecs()).map((s) => s.code)).toEqual(
      expect.arrayContaining(["dfi", "hba"]),
    );

    const normal = await services.andrology.recordAdvancedTest("andro-1", { patientId: PATIENT, code: "dfi", value: 10, method: "SCSA", performedAt: "2026-06-22T09:00:00.000Z" });
    expect(normal.ok && normal.value.interpretation).toBe("normal");
    const abnormal = await services.andrology.recordAdvancedTest("andro-1", { patientId: PATIENT, code: "dfi", value: 42, performedAt: "2026-06-22T10:00:00.000Z" });
    expect(abnormal.ok && abnormal.value.interpretation).toBe("abnormal");

    // persisted history round-trips (numeric value preserved)
    const history = await services.andrology.advancedTests(PATIENT);
    expect(history).toHaveLength(2);
    expect(history.map((t) => t.value).sort((a, b) => a - b)).toEqual([10, 42]);

    // unknown spec rejected
    expect((await services.andrology.recordAdvancedTest("andro-1", { patientId: PATIENT, code: "nope", value: 1, performedAt: "2026-06-22T11:00:00.000Z" })).ok).toBe(false);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
