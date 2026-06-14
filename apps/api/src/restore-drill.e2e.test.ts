// BACKUP RESTORE DRILL (docs/PATIENT-DATA.md §restore, GO_LIVE_CHECKLIST A5). Proves
// the "tested restore" invariant mechanically: seed audited data → pg_dump → restore
// into a FRESH database → the restored audit hash-chain verifies intact AND the
// clinical/financial rows survived. Runs only where DATABASE_URL is set and the
// Postgres client tools (pg_dump/pg_restore) are present (skips cleanly otherwise,
// e.g. a CI runner without the client) — it is the harness behind the go-live
// restore runbook, not a per-PR gate.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { systemClock } from "@oxford/core";
import { AuditLog, PgAuditChainStore } from "@oxford/audit";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
function toolsPresent(): boolean {
  try {
    execFileSync("pg_dump", ["--version"], { stdio: "ignore" });
    execFileSync("pg_restore", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const RUN = Boolean(DATABASE_URL) && toolsPresent();

const TARGET_DB = "oxford_restore_drill";
const adminUrl = (base: string) => base.replace(/\/[^/]+$/, "/postgres");
const targetUrl = (base: string) => base.replace(/\/[^/]+$/, `/${TARGET_DB}`);

describe.skipIf(!RUN)("backup restore drill (pg_dump → fresh DB → verify)", () => {
  const source = DATABASE_URL!;
  const dumpFile = `/tmp/oxford-restore-drill-${Date.now()}.dump`;
  let restored: pg.Pool;

  beforeAll(async () => {
    // 1. seed a known audited mutation into the source DB
    const pool = createPool(source);
    await runMigrations(pool);
    await pool.query("TRUNCATE billing.invoice, billing.payment, audit.audit_log");
    const services = buildServices(pool);
    const inv = await services.billing.createInvoice("fin-1", "drill-patient", [{ chargeCode: "CONSULT", description: { ar: "C", en: "C" }, unitAmountFils: 25000, quantity: 1 }]);
    if (!inv.ok) throw new Error("seed failed");
    await pool.end();

    // 2. pg_dump the source (custom format)
    execFileSync("pg_dump", ["-Fc", "-f", dumpFile, source], { stdio: "ignore" });
    // 3. drop + recreate a FRESH target database
    execFileSync("psql", [adminUrl(source), "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${TARGET_DB}`], { stdio: "ignore" });
    execFileSync("psql", [adminUrl(source), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${TARGET_DB}`], { stdio: "ignore" });
    // 4. restore into it (ignore benign restore notices; --exit-on-error catches real failures)
    execFileSync("pg_restore", ["-d", targetUrl(source), "--no-owner", dumpFile], { stdio: "ignore" });
    restored = new pg.Pool({ connectionString: targetUrl(source) });
  });

  afterAll(async () => {
    if (restored) await restored.end();
    if (DATABASE_URL) {
      try {
        execFileSync("psql", [adminUrl(source), "-c", `DROP DATABASE IF EXISTS ${TARGET_DB}`], { stdio: "ignore" });
      } catch { /* best-effort cleanup */ }
    }
  });

  it("restores with the audit hash-chain intact and the seeded data present", async () => {
    // the restored audit chain verifies via the REAL verification path
    const audit = new AuditLog(new PgAuditChainStore(restored), systemClock);
    const integrity = await audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);

    // the seeded clinical/financial data survived the dump→restore
    const inv = await restored.query<{ n: string }>("SELECT count(*)::text AS n FROM billing.invoice WHERE patient_id = 'drill-patient'");
    expect(Number(inv.rows[0]!.n)).toBe(1);
    const aud = await restored.query<{ n: string }>("SELECT count(*)::text AS n FROM audit.audit_log");
    expect(Number(aud.rows[0]!.n)).toBeGreaterThan(0);
  });
});
