// Integration: clinical records persist to Postgres, incl. append-only note
// version history. Runs where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { ClinicalService } from "./clinical-service.js";
import { PgClinicalStore } from "./pg-store.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_clinical.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgClinicalStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE clinical.encounter, clinical.clinical_note, clinical.clinical_order, clinical.result, clinical.letter");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists encounter, append-only note history, order→result→ack, signed letter", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new ClinicalService(new PgClinicalStore(pool), audit, events, clock);

    const enc = await svc.openEncounter("doc-1", "pat-1", "new_fertility", "doc-1");
    const note = await svc.writeNote("doc-1", enc.id, "pat-1", { plan: "v1" });
    await svc.amendNote("doc-1", note.id, { plan: "v2" });
    const persisted = await svc.getNote(note.id);
    expect(persisted!.versions).toHaveLength(2);
    expect(persisted!.versions[0]!.body).toEqual({ plan: "v1" });

    const order = await svc.placeOrder("doc-1", enc.id, "pat-1", "lab", "AMH");
    const r = await svc.fileResult("lab-1", order.id, "1.2", true);
    if (!r.ok) throw new Error("setup");
    await svc.acknowledgeResult("doc-1", r.value.id);
    const raw = await pool.query<{ status: string }>("SELECT status FROM clinical.clinical_order WHERE id = $1", [order.id]);
    expect(raw.rows[0]!.status).toBe("acknowledged");

    const letter = await svc.draftLetter("doc-1", "pat-1", "letter.referral", "ar", "نص");
    await svc.signLetter("doc-1", letter.id);
    const lraw = await pool.query<{ status: string }>("SELECT status FROM clinical.letter WHERE id = $1", [letter.id]);
    expect(lraw.rows[0]!.status).toBe("signed");
  });
});
