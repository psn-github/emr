// Integration: scheduling persists to Postgres and conflict detection works
// against the jsonb resource-id query. Runs where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { SchedulingService } from "./scheduling-service.js";
import { PgSchedulingStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_scheduling.sql", import.meta.url), "utf8");
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("PgSchedulingStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("books and detects a conflict via the persisted resource-id query", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new SchedulingService(new PgSchedulingStore(pool), audit, events);
    const doc = await svc.addResource("practitioner", N("Dr A"));
    const scanner = await svc.addResource("scanner", N("Scanner 1"));
    const type = await svc.addAppointmentType(N("Scan"), 30, ["practitioner", "scanner"]);

    const first = await svc.book("rec-1", { typeId: type.id, patientId: "pat-1", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:00:00Z", end: "2026-06-15T09:30:00Z" });
    expect(first.ok).toBe(true);
    const clash = await svc.book("rec-1", { typeId: type.id, patientId: "pat-2", practitionerId: doc.id, resourceIds: [scanner.id], start: "2026-06-15T09:15:00Z", end: "2026-06-15T09:45:00Z" });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error.detailKey).toBe("scheduling.conflict");

    expect(await svc.list()).toHaveLength(1);
  });
});
