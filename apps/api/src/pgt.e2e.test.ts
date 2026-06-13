// CROSS-CUTTING e2e — PGT capture THROUGH the tRPC API against real Postgres.
// Proves: (1) RBAC — PGT is embryology-domain (a clinical role is denied); (2) the
// conservative posture — with NO permitted indications configured (counsel
// pending), every PGT order is rejected, so PGT is blocked until the clinic
// configures its permitted set. (The accept path is unit-tested in the package.)
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

describe.skipIf(!DATABASE_URL)("PGT capture (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE embryology.pgt_order, embryology.pgt_result");
  });
  afterAll(async () => {
    await pool.end();
  });

  const order = { embryoId: "e-1", cycleId: "cycle-1", type: "PGT-A" as const, indication: "aneuploidy_screening", consentDocumentRef: "consent-1", orderedAt: "2026-07-01T08:00:00Z" };

  it("RBAC: a clinical role cannot order PGT (embryology domain)", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.embryology.orderPgt(order), "FORBIDDEN");
  });

  it("PGT is blocked until permitted indications are configured (counsel pending)", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    await expectCode(() => emb.embryology.orderPgt(order), "BAD_REQUEST"); // indication_not_permitted (empty config)
  });
});
