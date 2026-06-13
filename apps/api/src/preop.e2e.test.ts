// e2e — pre-operative assessment THROUGH the tRPC API on real Postgres. Proves
// RBAC (clinical domain), validation (ASA range; fasting + consent required), and
// persistence.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

const ok = { encounterId: "enc-1", anaestheticHistory: "nil significant", mallampatiClass: 2, asaGrade: 2, investigations: ["FBC", "ECG"], fastingConfirmed: true, consentRef: "consent-1", assessedAt: "2026-06-22T07:00:00Z" };

describe.skipIf(!DATABASE_URL)("pre-op assessment (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE perioperative.preop_assessment");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("records a valid assessment and rejects bad ones; reception is denied", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    const r = await doc.perioperative.recordPreOp(ok);
    expect(r.asaGrade).toBe(2);
    await expectCode(() => doc.perioperative.recordPreOp({ ...ok, encounterId: "enc-2", asaGrade: 9 }), "BAD_REQUEST");
    await expectCode(() => doc.perioperative.recordPreOp({ ...ok, encounterId: "enc-3", fastingConfirmed: false }), "BAD_REQUEST");

    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.recordPreOp(ok), "FORBIDDEN");
  });
});
