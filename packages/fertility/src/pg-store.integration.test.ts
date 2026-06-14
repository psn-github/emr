// Integration: cycles persist to Postgres, incl. owner kind + consents. Runs
// where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { CycleService } from "./cycle-service.js";
import { PgCycleStore } from "./pg-store.js";
import { InMemoryReasonCodeStore } from "./reason-codes.js";
import type { FertilityGate } from "./gate.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_fertility.sql", import.meta.url), "utf8");
const cancellationMigration = readFileSync(new URL("../migrations/0004_fertility_cancellation_coding.sql", import.meta.url), "utf8");
const allowGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: true, value: undefined }) };

describe.skipIf(!DATABASE_URL)("PgCycleStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(migration);
    await pool.query(cancellationMigration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE fertility.cycle, fertility.protocol");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists a treatment cycle, consents, and an advance", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new CycleService(new PgCycleStore(pool), audit, events, clock, allowGate, new InMemoryReasonCodeStore());

    const r = await svc.createTreatmentCycle("doc-1", "icsi", "couple-1", "antagonist");
    if (!r.ok) throw new Error("setup");
    for (const c of ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]) await svc.recordConsent("doc-1", r.value.id, c);
    await svc.advanceStatus("doc-1", r.value.id, "stimulating");

    const raw = await pool.query<{ status: string; owner_kind: string; signed_consents: string[] }>(
      "SELECT status, owner_kind, signed_consents FROM fertility.cycle WHERE id = $1",
      [r.value.id],
    );
    expect(raw.rows[0]!.status).toBe("stimulating");
    expect(raw.rows[0]!.owner_kind).toBe("couple");
    expect(raw.rows[0]!.signed_consents).toHaveLength(3);
  });
});
