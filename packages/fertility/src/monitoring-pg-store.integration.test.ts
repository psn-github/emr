// Integration: monitoring visits + procedures persist to Postgres. Runs where
// DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { MonitoringService } from "./monitoring-service.js";
import { PgMonitoringStore } from "./monitoring-pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const m1 = readFileSync(new URL("../migrations/0001_fertility.sql", import.meta.url), "utf8");
const m3 = readFileSync(new URL("../migrations/0003_fertility_monitoring.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgMonitoringStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(m1);
    await pool.query(m3);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE fertility.monitoring_visit, fertility.procedure");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists a trigger visit + its retrieval procedure", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new MonitoringService(new PgMonitoringStore(pool), audit, events);

    await svc.recordVisit("doc-1", "cycle-1", { visitAt: "2026-06-20T08:00:00Z", decision: "trigger", triggerAt: "2026-06-20T21:00:00.000Z" });
    const visits = await svc.visits("cycle-1");
    expect(visits).toHaveLength(1);
    expect(visits[0]!.decision).toBe("trigger");
    const procs = await svc.procedures("cycle-1");
    expect(procs[0]!.scheduledAt).toBe("2026-06-22T09:00:00.000Z");
  });
});
