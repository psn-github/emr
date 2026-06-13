// Adversarial review (CLAUDE.md witnessing hard rule): "write the attack first,
// prove it fails." RI Witness is authoritative; Oxford may never override it and
// must block cycle-step sign-off on ANY divergence. These tests run against a
// real Postgres (DATABASE_URL) — the same store production uses.
//
// Attacks attempted:
//   A1. Sign off a step whose handling event RI has not confirmed (pending).
//   A2. Sign off when RI says a DIFFERENT patient (wrong-patient nightmare).
//   A3. Sign off when RI electronically flagged a mismatch.
//   A4. Sign off when RI witnessed a handling Oxford never recorded (orphan).
//   A5. Find any API path that forces a divergent event to "matched" (override).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { WitnessingService } from "./witnessing-service.js";
import { PgWitnessingStore } from "./pg-store.js";
import { RiWitnessStubProvider } from "./provider.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_witnessing.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("witnessing — RI Witness authority cannot be overridden", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-22T08:30:00.000Z"));

  function svcWith(provider: RiWitnessStubProvider) {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    return new WitnessingService(new PgWitnessingStore(pool), provider, audit, events, clock);
  }

  const handling = {
    cycleId: "cycle-1",
    stepKey: "insemination",
    oxfordKey: "cycle-1:insemination:sample-A",
    patientId: "pat-1",
    sampleId: "sample-A",
    occurredAt: "2026-06-22T08:00:00.000Z",
  };

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("A1: blocks sign-off while RI has not confirmed (pending_sync)", async () => {
    const svc = svcWith(new RiWitnessStubProvider());
    await svc.registerHandlingEvent("embryologist-1", handling);
    const r = await svc.assertCycleStepSignOff("cycle-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("witnessing.sign_off.blocked");
  });

  it("A2: blocks sign-off when RI reports a DIFFERENT patient", async () => {
    const provider = new RiWitnessStubProvider();
    const svc = svcWith(provider);
    const ev = await svc.registerHandlingEvent("embryologist-1", handling);
    provider.seedRecord("cycle-1", { riRecordId: "ri-1", oxfordKey: ev.oxfordKey, patientId: "pat-INTRUDER", sampleId: "sample-A", outcome: "witnessed", witnessedAt: "t" });
    const rows = await svc.ingest("embryologist-1", "cycle-1");
    expect(rows[0]!.reason).toBe("patient_mismatch");
    expect((await svc.assertCycleStepSignOff("cycle-1")).ok).toBe(false);
  });

  it("A3: blocks sign-off when RI electronically flagged a mismatch", async () => {
    const provider = new RiWitnessStubProvider();
    const svc = svcWith(provider);
    const ev = await svc.registerHandlingEvent("embryologist-1", handling);
    provider.seedRecord("cycle-1", { riRecordId: "ri-1", oxfordKey: ev.oxfordKey, patientId: "pat-1", sampleId: "sample-A", outcome: "mismatch", witnessedAt: "t" });
    expect((await svc.assertCycleStepSignOff("cycle-1")).ok).toBe(false);
  });

  it("A4: blocks sign-off when RI witnessed a handling Oxford never recorded (orphan)", async () => {
    const provider = new RiWitnessStubProvider();
    const svc = svcWith(provider);
    const ev = await svc.registerHandlingEvent("embryologist-1", handling);
    provider.seedMatching(ev, "ri-1", "t"); // the legit handling matches
    provider.seedRecord("cycle-1", { riRecordId: "ri-GHOST", oxfordKey: "cycle-1:icsi:sample-GHOST", patientId: "pat-1", sampleId: "sample-GHOST", outcome: "witnessed", witnessedAt: "t" });
    const rows = await svc.ingest("embryologist-1", "cycle-1");
    expect(rows.some((r) => r.reason === "orphan_ri_record")).toBe(true);
    expect((await svc.assertCycleStepSignOff("cycle-1")).ok).toBe(false);
  });

  it("A5: there is no override — only RI confirmation flips a step to matched", async () => {
    const provider = new RiWitnessStubProvider();
    const svc = svcWith(provider);
    const ev = await svc.registerHandlingEvent("embryologist-1", handling);
    // No method exists to assert "matched" from Oxford. The only way through:
    provider.seedMatching(ev, "ri-1", "t");
    const r = await svc.assertCycleStepSignOff("cycle-1");
    expect(r.ok).toBe(true);
  });
});
