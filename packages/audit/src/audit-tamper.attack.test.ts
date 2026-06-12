// ADVERSARIAL SELF-REVIEW (attack a): actively tamper with the audit log AT REST
// in Postgres — bypassing the application entirely — and prove the hash-chain
// verification catches every alteration. If any attack went undetected, this
// suite would fail and the audit subsystem would not be merged.
//
// Runs against a real Postgres (DATABASE_URL); CI provides one. Skipped only
// where no database is configured.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog } from "./audit-log.js";
import { PgAuditChainStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_audit.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("ATTACK: tamper with the audit log at rest", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE audit.audit_log");
  });
  afterAll(async () => {
    await pool.end();
  });

  async function seedInvoiceTrail(): Promise<AuditLog> {
    const audit = new AuditLog(new PgAuditChainStore(pool), fixedClock(new Date("2026-06-12T08:00:00.000Z")));
    await audit.record({ actorId: "finance-1", entityType: "Invoice", entityId: "inv-1", action: "CREATE", after: { total: 100 } });
    await audit.record({ actorId: "finance-1", entityType: "Invoice", entityId: "inv-1", action: "UPDATE", before: { total: 100 }, after: { total: 120 } });
    await audit.record({ actorId: "finance-1", entityType: "Invoice", entityId: "inv-1", action: "UPDATE", before: { total: 120 }, after: { total: 150 } });
    return audit;
  }

  it("detects an edited row (someone rewrites an invoice total in the DB)", async () => {
    const audit = await seedInvoiceTrail();

    const clean = await audit.verifyIntegrity();
    expect(clean.ok).toBe(true);
    console.log("[attack a1] chain intact before attack:", clean.ok);

    // ATTACK: edit history at rest, straight in the database.
    await pool.query("UPDATE audit.audit_log SET after_json = '{\"total\":0}'::jsonb WHERE seq = 2");

    const result = await audit.verifyIntegrity();
    console.log(
      "[attack a1] after tampering with seq 2 → verification:",
      result.ok ? "MISSED (FAIL)" : `DETECTED (${result.ok ? "" : result.error.reason} @ seq ${result.ok ? "" : result.error.seq})`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ seq: 2, reason: "hash-mismatch" });
    }
  });

  it("detects a deleted row (someone removes an inconvenient entry)", async () => {
    const audit = await seedInvoiceTrail();

    // ATTACK: delete a middle entry to hide it.
    await pool.query("DELETE FROM audit.audit_log WHERE seq = 2");

    const result = await audit.verifyIntegrity();
    console.log(
      "[attack a2] after deleting seq 2 → verification:",
      result.ok ? "MISSED (FAIL)" : `DETECTED (${result.ok ? "" : result.error.reason} @ seq ${result.ok ? "" : result.error.seq})`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("seq-out-of-order");
  });

  it("confirms a genuinely intact chain still verifies (no false positives)", async () => {
    const audit = await seedInvoiceTrail();
    const result = await audit.verifyIntegrity();
    expect(result.ok).toBe(true);
  });
});
