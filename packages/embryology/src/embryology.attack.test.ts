// Adversarial review (CLAUDE.md): the embryology lab must NOT be able to commit
// a terminal act (embryo transfer / disposition) while its handling chain
// diverges from — or is unconfirmed by — RI Witness. Wired to the REAL
// witnessing service + RI stub, against a real Postgres.
//
// Attacks attempted:
//   A1. Transfer an embryo whose insemination RI has not yet confirmed.
//   A2. Dispose of an embryo when RI reports a DIFFERENT patient (divergence).
//   A3. Confirm the legitimate path only flows once RI matches.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { WitnessingService, PgWitnessingStore, RiWitnessStubProvider } from "@oxford/witnessing";
import { EmbryologyService } from "./embryology-service.js";
import { PgEmbryologyStore } from "./pg-store.js";
import type { WitnessPort } from "./witness-port.js";

const DATABASE_URL = process.env.DATABASE_URL;
const embMig = readFileSync(new URL("../migrations/0001_embryology.sql", import.meta.url), "utf8");
const witMig = readFileSync(new URL("../../witnessing/migrations/0001_witnessing.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("embryology — terminal acts blocked unless RI Witness reconciles", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));

  function build(provider: RiWitnessStubProvider) {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const witnessing = new WitnessingService(new PgWitnessingStore(pool), provider, audit, events, clock);
    const port: WitnessPort = {
      registerHandlingEvent: (a, i) => witnessing.registerHandlingEvent(a, i).then(() => undefined),
      assertCycleStepSignOff: (c) => witnessing.assertCycleStepSignOff(c),
    };
    const svc = new EmbryologyService(new PgEmbryologyStore(pool), port, audit, events);
    return { svc, witnessing };
  }

  beforeAll(async () => {
    await pool.query(witMig);
    await pool.query(embMig);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    await pool.query("TRUNCATE embryology.oocyte, embryology.insemination, embryology.fertilisation_check, embryology.embryo, embryology.grading_entry, embryology.disposition, embryology.embryo_transfer");
  });
  afterAll(async () => {
    await pool.end();
  });

  const CYCLE = "cycle-1";

  it("A1: transfer is blocked while RI has not confirmed the insemination", async () => {
    const { svc } = build(new RiWitnessStubProvider());
    await svc.recordInsemination("emb-1", { cycleId: CYCLE, oocyteId: "ooc-1", method: "ICSI", spermSourceId: "sp-1", operator: "emb-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" });
    const r = await svc.recordTransfer("emb-1", { cycleId: CYCLE, embryoIds: ["e-1"], catheter: "soft", difficulty: "easy", ultrasoundGuided: true, operator: "emb-1", transferredAt: "2026-06-27T10:00:00Z", patientId: "pat-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("witnessing.sign_off.blocked");
    expect(await svc.transfers(CYCLE)).toHaveLength(0);
  });

  it("A2: disposition is blocked when RI reports a different patient (divergence)", async () => {
    const provider = new RiWitnessStubProvider();
    const { svc, witnessing } = build(provider);
    await svc.recordInsemination("emb-1", { cycleId: CYCLE, oocyteId: "ooc-1", method: "ICSI", spermSourceId: "sp-1", operator: "emb-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" });
    provider.seedRecord(CYCLE, { riRecordId: "ri-1", oxfordKey: "cycle-1:insemination:ooc-1", patientId: "pat-INTRUDER", sampleId: "ooc-1", outcome: "witnessed", witnessedAt: "t" });
    await witnessing.ingest("emb-1", CYCLE);
    const r = await svc.recordDisposition("emb-1", { cycleId: CYCLE, embryoId: "e-1", type: "discard", occurredAt: "2026-06-27T09:00:00Z", operator: "emb-1", patientId: "pat-1" });
    expect(r.ok).toBe(false);
  });

  it("A3: the legitimate path flows only once RI matches the handling event", async () => {
    const provider = new RiWitnessStubProvider();
    const { svc } = build(provider);
    await svc.recordInsemination("emb-1", { cycleId: CYCLE, oocyteId: "ooc-1", method: "ICSI", spermSourceId: "sp-1", operator: "emb-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" });
    // RI confirms the same patient + sample for that handling key:
    provider.seedRecord(CYCLE, { riRecordId: "ri-1", oxfordKey: "cycle-1:insemination:ooc-1", patientId: "pat-1", sampleId: "ooc-1", outcome: "witnessed", witnessedAt: "t" });
    const r = await svc.recordTransfer("emb-1", { cycleId: CYCLE, embryoIds: ["e-1"], catheter: "soft", difficulty: "easy", ultrasoundGuided: true, operator: "emb-1", transferredAt: "2026-06-27T10:00:00Z", patientId: "pat-1" });
    expect(r.ok).toBe(true);
    expect(await svc.transfers(CYCLE)).toHaveLength(1);
  });
});
