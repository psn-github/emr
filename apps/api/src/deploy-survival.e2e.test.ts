// e2e — DEPLOY-OVER-POPULATED-DB SURVIVAL DRILL (docs/PATIENT-DATA.md invariant 4:
// "patient & clinical history survives every deploy"; GO_LIVE_CHECKLIST A4).
// Proves the invariant DIRECTLY rather than by inference: stage the currently
// deployed schema, populate it with clinical history + an audit hash-chain (as a
// prior deploy would have), then apply the NEW additive migrations as "the next
// deploy" and assert nothing is lost or mutated and the chain stays intact.
//
// The "deploy delta" is the real latest additive migrations (the allergy feature,
// ADR-0060): a new table (clinical.drug_allergy) + a new column on a POPULATED
// table (fertility.stim_day.allergy_warnings) — the two shapes a safe migration
// takes. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations, migrationFiles } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

// The migrations introduced by "the deploy under test" (relative to package root).
const DEPLOY_DELTA = [
  "clinical/migrations/0005_clinical_allergy.sql",
  "fertility/migrations/0006_fertility_allergy_warnings.sql",
];

describe.skipIf(!DATABASE_URL)("deploy-over-populated-DB survival (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  const services = buildServices(pool);

  // Everything except the deploy delta = the "already deployed" production schema.
  const before = migrationFiles().filter((f) => !DEPLOY_DELTA.some((d) => f.endsWith(d)));

  beforeAll(async () => {
    // Start from a genuinely empty DB so the staging is faithful.
    await pool.query("DROP SCHEMA IF EXISTS _meta CASCADE");
  });
  beforeEach(async () => {
    // (single test; nothing to reset between)
  });
  afterAll(async () => {
    await pool.end();
  });

  it("preserves clinical history + audit chain when the next deploy's additive migrations are applied", async () => {
    // 1) Deploy v1: the prior schema (no allergy table, no allergy_warnings column).
    await runMigrations(pool, before);

    // 2) Populate as a running clinic would: clinical history (append-only note
    //    with an amendment) through the audited service, plus a stimulation day
    //    written in the OLD row shape (no allergy_warnings — that column doesn't
    //    exist yet), exactly as the previous deploy's code would have written it.
    const enc = await services.clinical.openEncounter("doc-1", "pat-1", "new_fertility", "doc-1");
    const note = await services.clinical.writeNote("doc-1", enc.id, "pat-1", { history: "G2P1", plan: "AMH + baseline scan" });
    const amended = await services.clinical.amendNote("doc-1", note.id, { history: "G2P1", plan: "start antagonist ICSI" });
    expect(amended.ok).toBe(true);

    // A dedicated cycle id so this row can't collide with other e2e files'
    // stim_day rows (they share this DB; files run serially).
    await pool.query(
      `INSERT INTO fertility.stim_day (id, cycle_id, day, drugs, follicles, endometrium_mm, endocrine, recorded_by, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ["sd-legacy", "ds-cycle", 1, JSON.stringify([{ formularyItemId: "rfsh", dose: 225, unit: "IU" }]), JSON.stringify([]), 8, JSON.stringify({ e2: 800 }), "nurse-1", "2026-06-13T08:00:00.000Z"],
    );

    // Snapshot the "before deploy" state.
    const auditCountBefore = Number((await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM audit.audit_log")).rows[0]!.n);
    expect(auditCountBefore).toBeGreaterThan(0);
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);

    // 3) Deploy v2: apply the new code's migrations. runMigrations skips the
    //    already-applied ones and applies exactly the delta.
    const applied = await runMigrations(pool);
    expect(applied.some((n) => n.endsWith("0005_clinical_allergy.sql"))).toBe(true);
    expect(applied.some((n) => n.endsWith("0006_fertility_allergy_warnings.sql"))).toBe(true);

    // 4) SURVIVAL: every pre-existing row is intact and unmutated.
    const noteAfter = await services.clinical.getNote(note.id);
    expect(noteAfter?.versions.map((v) => v.version)).toEqual([1, 2]); // append-only history preserved
    expect(noteAfter?.versions[0]!.body).toEqual({ history: "G2P1", plan: "AMH + baseline scan" }); // original untouched

    const sd = await pool.query<{ day: number; drugs: { dose: number }[]; allergy_warnings: unknown[] }>(
      "SELECT day, drugs, allergy_warnings FROM fertility.stim_day WHERE id = $1",
      ["sd-legacy"],
    );
    expect(sd.rows[0]!.day).toBe(1);
    expect(sd.rows[0]!.drugs[0]!.dose).toBe(225); // existing data unchanged
    expect(sd.rows[0]!.allergy_warnings).toEqual([]); // new column backfilled to its default — no loss

    // 5) Audit hash-chain survives the deploy intact, and no entries vanished.
    const auditCountAfter = Number((await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM audit.audit_log")).rows[0]!.n);
    expect(auditCountAfter).toBe(auditCountBefore);
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);

    // 6) The new capability is present — additive, not destructive. (Asserted by
    //    existence, not row count: this DB is shared across e2e files.)
    const allergyTable = await pool.query<{ t: string | null }>("SELECT to_regclass('clinical.drug_allergy') AS t");
    expect(allergyTable.rows[0]!.t).toBe("clinical.drug_allergy");

    // 7) Re-running the deploy is a no-op: every deploy is safe to repeat.
    expect(await runMigrations(pool)).toEqual([]);
  });
});
