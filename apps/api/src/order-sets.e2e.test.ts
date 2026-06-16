// P1 — CLINICAL PATHWAYS / ORDER SETS, end-to-end on real Postgres. Proves: order
// sets are config; applying one to an encounter places all its orders at once and
// persists them; unknown sets are rejected; the audit chain stays intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedOrderSets, SEED_ORDER_SETS } from "@oxford/clinical";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P1 clinical pathways / order sets (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedOrderSets(pool, SEED_ORDER_SETS);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE clinical.clinical_order, clinical.encounter");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists order sets and applies one, persisting all its orders", async () => {
    expect((await services.clinical.listOrderSets()).map((s) => s.id)).toEqual(
      expect.arrayContaining(["early_pregnancy", "recurrent_miscarriage_workup"]),
    );

    const enc = await services.clinical.openEncounter("doc-1", "pat-1", "antenatal", "doc-1");
    const r = await services.clinical.applyOrderSet("doc-1", enc.id, "pat-1", "recurrent_miscarriage_workup");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(4);

    // the orders are persisted against the encounter
    const rows = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM clinical.clinical_order WHERE encounter_id = $1", [enc.id]);
    expect(Number(rows.rows[0]!.n)).toBe(4);

    // unknown set rejected
    expect((await services.clinical.applyOrderSet("doc-1", enc.id, "pat-1", "nope")).ok).toBe(false);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
