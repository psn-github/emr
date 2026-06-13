// Adversarial review (CLAUDE.md): a sperm freeze must carry HONEST witnessing
// provenance — it is registered for reconciliation against RI Witness, and a
// divergence (RI reports a different patient) must surface as `divergent`, never
// be silently treated as witnessed. Wired to the REAL witnessing service +
// RI stub against a real Postgres. (WHO 6th-ed flag integrity is proven in
// semen-analysis.test.ts.)
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { WitnessingService, PgWitnessingStore, RiWitnessStubProvider } from "@oxford/witnessing";
import { AndrologyService } from "./andrology-service.js";
import { PgAndrologyStore } from "./pg-store.js";
import type { WitnessPort } from "./witness-port.js";

const DATABASE_URL = process.env.DATABASE_URL;
const andMig = readFileSync(new URL("../migrations/0001_andrology.sql", import.meta.url), "utf8");
const witMig = readFileSync(new URL("../../witnessing/migrations/0001_witnessing.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("andrology — the sperm freeze carries honest RI Witness provenance", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-22T10:00:00.000Z"));

  function build(provider: RiWitnessStubProvider) {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const witnessing = new WitnessingService(new PgWitnessingStore(pool), provider, audit, events, clock);
    const port: WitnessPort = {
      registerHandlingEvent: (a, i) => witnessing.registerHandlingEvent(a, i).then(() => undefined),
    };
    const svc = new AndrologyService(new PgAndrologyStore(pool), port, audit, events);
    return { svc, witnessing };
  }

  beforeAll(async () => {
    await pool.query(witMig);
    await pool.query(andMig);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    await pool.query("TRUNCATE andrology.semen_analysis, andrology.sperm_prep, andrology.sperm_freeze, andrology.surgical_retrieval");
  });
  afterAll(async () => {
    await pool.end();
  });

  const CYCLE = "cycle-1";
  const freeze = { cycleId: CYCLE, patientId: "pat-1", cryoSpecimenRef: "cryo-9", straws: 4, frozenAt: "2026-06-22T10:00:00Z" };

  it("a freeze confirmed by RI reconciles as matched", async () => {
    const provider = new RiWitnessStubProvider();
    const { svc, witnessing } = build(provider);
    await svc.recordFreeze("andro-1", freeze);
    provider.seedRecord(CYCLE, { riRecordId: "ri-1", oxfordKey: "cycle-1:freeze.sperm:cryo-9", patientId: "pat-1", sampleId: "cryo-9", outcome: "witnessed", witnessedAt: "t" });
    const rows = await witnessing.ingest("andro-1", CYCLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("matched");
  });

  it("a freeze with a divergent RI record (different patient) reconciles as divergent — not silently witnessed", async () => {
    const provider = new RiWitnessStubProvider();
    const { svc, witnessing } = build(provider);
    await svc.recordFreeze("andro-1", freeze);
    provider.seedRecord(CYCLE, { riRecordId: "ri-1", oxfordKey: "cycle-1:freeze.sperm:cryo-9", patientId: "pat-INTRUDER", sampleId: "cryo-9", outcome: "witnessed", witnessedAt: "t" });
    const rows = await witnessing.ingest("andro-1", CYCLE);
    expect(rows[0]!.status).toBe("divergent");
    expect(rows[0]!.reason).toBe("patient_mismatch");
    // And the cycle cannot be signed off while divergent.
    expect((await witnessing.assertCycleStepSignOff(CYCLE)).ok).toBe(false);
  });
});
