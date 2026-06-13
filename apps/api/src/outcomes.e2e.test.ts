// CROSS-CUTTING e2e — the outcome continuum THROUGH the tRPC API against real
// Postgres. Proves: (1) RBAC — outcomes are clinical-domain (reception denied);
// (2) the fertility → pregnancy → live-birth continuum records and reconstructs,
// linked back to the originating cycle, with Vienna KPI inputs. Runs where
// DATABASE_URL is set.
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

describe.skipIf(!DATABASE_URL)("outcomes continuum (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE outcomes.pregnancy_test, outcomes.clinical_assessment, outcomes.pregnancy_outcome");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("RBAC: a reception (scheduling) role cannot touch clinical outcomes", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.outcomes.recordTest({ cycleId: "c1", betaHcgMiuMl: 100, testedAt: "2026-07-05T08:00:00Z" }), "FORBIDDEN");
  });

  it("records the continuum and reconstructs it (linked to the cycle) with KPI inputs", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await doc.outcomes.recordTest({ cycleId: "c1", betaHcgMiuMl: 180, testedAt: "2026-07-05T08:00:00Z" });
    await doc.outcomes.recordAssessment({ cycleId: "c1", gestationalSacs: 1, fetalHeartbeats: 1, assessedAt: "2026-07-20T08:00:00Z" });
    await doc.outcomes.recordOutcome({ cycleId: "c1", type: "live_birth", liveBirthCount: 1, gestationalAgeWeeks: 39, occurredAt: "2027-03-01T08:00:00Z" });

    const { summary, kpi } = await doc.outcomes.summary({ cycleId: "c1" });
    expect(summary.test!.result).toBe("positive");
    expect(summary.outcome!.type).toBe("live_birth");
    expect(kpi).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, ongoing: false });
  });

  it("rejects a live birth recorded without a count", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.outcomes.recordOutcome({ cycleId: "c2", type: "live_birth", occurredAt: "2027-03-01T08:00:00Z" }), "BAD_REQUEST");
  });
});
