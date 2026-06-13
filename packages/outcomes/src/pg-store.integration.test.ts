// Integration: the cycle outcome continuum persists to Postgres and
// reconstructs (linked back to the originating cycle). Runs where DATABASE_URL
// is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { OutcomesService } from "./outcomes-service.js";
import { PgOutcomesStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const mig = readFileSync(new URL("../migrations/0001_outcomes.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgOutcomesStore — continuum reconstructs from Postgres", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(mig);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE outcomes.pregnancy_test, outcomes.clinical_assessment, outcomes.pregnancy_outcome");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("records the whole journey for a cycle and reconstructs it + KPI inputs", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new OutcomesService(new PgOutcomesStore(pool), audit, events);

    await svc.recordPregnancyTest("doc-1", { cycleId: "cycle-9", betaHcgMiuMl: 220, testedAt: "2026-07-05T08:00:00Z" });
    await svc.recordClinicalAssessment("doc-1", { cycleId: "cycle-9", gestationalSacs: 2, fetalHeartbeats: 2, assessedAt: "2026-07-20T08:00:00Z" });
    await svc.recordPregnancyOutcome("doc-1", { cycleId: "cycle-9", type: "live_birth", liveBirthCount: 2, gestationalAgeWeeks: 37, occurredAt: "2027-02-15T08:00:00Z" });

    const summary = await svc.outcomeForCycle("cycle-9");
    expect(summary.test!.result).toBe("positive");
    expect(summary.clinicalAssessment!.clinicalPregnancy).toBe(true);
    expect(summary.outcome!.liveBirthCount).toBe(2);
    expect(await svc.kpiInputs("cycle-9")).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, ongoing: false });
  });
});
