// Integration: stimulation days persist to Postgres. Runs where DATABASE_URL set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { StimulationService } from "./stim-service.js";
import { PgStimStore } from "./stim-pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const m1 = readFileSync(new URL("../migrations/0001_fertility.sql", import.meta.url), "utf8");
const m2 = readFileSync(new URL("../migrations/0002_fertility_stim.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgStimStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(m1);
    await pool.query(m2);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE fertility.stim_day");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists a stimulation day and reads it back ordered", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new StimulationService(new PgStimStore(pool), audit, events, clock);

    await svc.recordDay("nurse-1", "cycle-1", { day: 2, drugs: [{ formularyItemId: "hp_hmg", dose: 150, unit: "IU" }], endometriumMm: 6, endocrine: { e2: 800 } });
    const chart = await svc.chart("cycle-1");
    expect(chart).toHaveLength(1);
    expect(chart[0]!.drugs[0]!.formularyItemId).toBe("hp_hmg");
    const raw = await pool.query<{ day: number }>("SELECT day FROM fertility.stim_day WHERE cycle_id = $1", ["cycle-1"]);
    expect(raw.rows[0]!.day).toBe(2);
  });
});
