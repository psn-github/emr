// P2 — RESEARCH / REGISTRY EXPORT, end-to-end on real Postgres. Proves: the
// export is de-identified by construction (no raw identifiers, banded age, salted
// hashes) and the sensitive read is audited (READ_EXPORT) with the chain intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RegistryCycleInput } from "@oxford/outcomes";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

const cycle = (over: Partial<RegistryCycleInput>): RegistryCycleInput => ({
  cycleId: "rx-cycle-1",
  patientRef: "rx-person-1",
  ageYears: 41,
  cycleType: "ICSI",
  protocol: "antagonist",
  oocytesRetrieved: 12,
  matureOocytes: 9,
  twoPnZygotes: 7,
  embryosTransferred: 1,
  biochemicalPregnancy: true,
  clinicalPregnancy: true,
  liveBirth: false,
  liveBirthCount: 0,
  ...over,
});

describe.skipIf(!DATABASE_URL)("P2 research/registry export (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("emits a de-identified, ESHRE-shaped export and audits the read", async () => {
    const inputs = [cycle({}), cycle({ cycleId: "rx-cycle-2", patientRef: "rx-person-1", ageYears: 33 })];
    const rows = await services.outcomes.researchExport("researcher-1", inputs, "residency-secret-salt");

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ageBand)).toEqual(["40-42", "<35"]);
    // sibling cycles (same patientRef) share a patientKey but differ in cycleKey
    expect(rows[0]!.patientKey).toBe(rows[1]!.patientKey);
    expect(rows[0]!.cycleKey).not.toBe(rows[1]!.cycleKey);
    // no raw identifiers / exact age leak
    const serialised = JSON.stringify(rows);
    for (const pii of ["rx-cycle-1", "rx-cycle-2", "rx-person-1", "41", "33"]) {
      expect(serialised).not.toContain(pii);
    }

    // the export is audited as a sensitive read
    const r = await pool.query("SELECT count(*)::int AS n FROM audit.audit_log WHERE entity_type = 'ResearchRegistryExport' AND action = 'READ_EXPORT'");
    expect(r.rows[0].n).toBeGreaterThanOrEqual(1);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
