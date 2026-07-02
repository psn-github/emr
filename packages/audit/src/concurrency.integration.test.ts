// Integration: the audit chain under CONCURRENT writers (ADR-0061), against real
// Postgres. Proves the load-baseline property: N mutations recorded concurrently
// ALL persist (no lost audit entries), the chain stays strictly linear (seq
// 1..N, no gaps, no forks), and verifyIntegrity passes — the advisory lock
// serializes and HashChainLog's bounded retry lets every loser land.
// Runs where DATABASE_URL is set (CI provides it).
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog } from "./audit-log.js";
import { PgAuditChainStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_audit.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("audit chain under concurrency (integration, real Postgres)", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const audit = new AuditLog(new PgAuditChainStore(pool), fixedClock(new Date("2026-06-20T08:00:00.000Z")));

  beforeEach(async () => {
    await pool.query(migration);
    await pool.query("TRUNCATE audit.audit_log");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists every one of N concurrent records with a gapless, intact chain", async () => {
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        audit.record({ actorId: `actor-${i}`, entityType: "Mutation", entityId: `${i}`, action: "CREATE", after: { i } }),
      ),
    );
    // Every writer got a record back (none dropped) with a distinct seq.
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    // The persisted chain is exactly 1..N, contiguous, and verifies.
    const persisted = await audit.entries();
    expect(persisted.map((r) => r.seq)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect((await audit.verifyIntegrity()).ok).toBe(true);

    // No two records share a hash (no fork).
    expect(new Set(persisted.map((r) => r.hash)).size).toBe(N);
  });
});
