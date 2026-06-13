// CROSS-CUTTING e2e — embryology lab THROUGH the tRPC API against real Postgres.
// Proves, in one flow: (1) deny-by-default RBAC — only the embryology domain may
// touch lab data; (2) the witnessing gate — an embryo transfer is BLOCKED while
// any handling event diverges from / is unconfirmed by RI Witness, and flows
// only once RI confirms (the Phase 2 exit-gate invariant, simulated). Runs where
// DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const embryologist: Session = {
  sessionId: "s-emb",
  subject: { staffId: "emb-1", roles: [{ id: "embryologist", name: "embryologist", permissions: ["embryology:*"] }] },
  mfa: true,
};
const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("embryology + witnessing (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    await pool.query("TRUNCATE embryology.oocyte, embryology.insemination, embryology.fertilisation_check, embryology.embryo, embryology.grading_entry, embryology.disposition, embryology.embryo_transfer");
    // Rebuild services each test so the in-memory RI Witness stub starts empty
    // (its seeded records would otherwise leak across tests).
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const CYCLE = "cycle-e2e-1";
  const insem = { cycleId: CYCLE, oocyteId: "ooc-1", method: "ICSI" as const, spermSourceId: "sp-1", operator: "emb-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" };
  const transfer = { cycleId: CYCLE, embryoIds: ["e-1"], catheter: "soft", difficulty: "easy" as const, ultrasoundGuided: true, operator: "emb-1", transferredAt: "2026-06-27T10:00:00Z", patientId: "pat-1" };

  it("RBAC: a wrong-domain (clinical) role cannot touch embryology lab data", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.embryology.read(), "FORBIDDEN");
    await expectCode(() => doc.embryology.recordInsemination(insem), "FORBIDDEN");
  });

  it("ATTACK: transfer is blocked while RI Witness has not confirmed the insemination", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    await emb.embryology.recordInsemination(insem);
    await expectCode(() => emb.embryology.recordTransfer(transfer), "PRECONDITION_FAILED");
  });

  it("the transfer flows only once RI Witness confirms the matching handling record", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    await emb.embryology.recordInsemination(insem);
    // Simulate RI Witness returning a confirming record for that handling key,
    // then reconcile (in production this ingest is event/poll-driven).
    services.witnessProvider.seedRecord(CYCLE, {
      riRecordId: "ri-1",
      oxfordKey: "cycle-e2e-1:insemination:ooc-1",
      patientId: "pat-1",
      sampleId: "ooc-1",
      outcome: "witnessed",
      witnessedAt: "2026-06-22T08:00:01Z",
    });
    await services.witnessing.ingest("emb-1", CYCLE);
    const r = await emb.embryology.recordTransfer(transfer);
    expect(r).toMatchObject({ count: 1 });
  });

  it("ATTACK: a divergent RI record (different patient) blocks the transfer", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    await emb.embryology.recordInsemination(insem);
    services.witnessProvider.seedRecord(CYCLE, {
      riRecordId: "ri-1",
      oxfordKey: "cycle-e2e-1:insemination:ooc-1",
      patientId: "pat-INTRUDER",
      sampleId: "ooc-1",
      outcome: "witnessed",
      witnessedAt: "2026-06-22T08:00:01Z",
    });
    await services.witnessing.ingest("emb-1", CYCLE);
    await expectCode(() => emb.embryology.recordTransfer(transfer), "PRECONDITION_FAILED");
  });
});
