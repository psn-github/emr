// e2e — IVF media-lot ↔ embryo traceability THROUGH the tRPC API on real Postgres
// (docs/01 §E4). Proves: a media/consumable lot applied to embryos/oocytes is
// recorded append-only; a manufacturer recall of that lot reaches EVERY exposed
// embryo/oocyte/cycle (and nothing from other lots); RBAC keeps lab data in the
// embryology domain. The lot is referenced by the inventory's own (itemId, lotNo)
// — a shared-identifier cross-reference, no cross-module dependency.
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

const T = "2026-06-22T08:00:00Z";

describe.skipIf(!DATABASE_URL)("media-lot ↔ embryo traceability (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let emb: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE embryology.media_application");
    services = buildServices(pool);
    emb = appRouter.createCaller({ session: embryologist, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("records applications and a recall reaches every exposed embryo/oocyte/cycle (only for that lot)", async () => {
    // LOT-A touched two embryos across two cycles + one oocyte pre-embryo
    await emb.embryology.recordMediaApplication({ cycleId: "cyc-1", embryoId: "embryo-1", itemId: "vitri-media", lotNo: "LOT-A", step: "vitrification", quantity: 1, appliedAt: T });
    await emb.embryology.recordMediaApplication({ cycleId: "cyc-2", embryoId: "embryo-2", itemId: "vitri-media", lotNo: "LOT-A", step: "vitrification", quantity: 1, appliedAt: T });
    await emb.embryology.recordMediaApplication({ cycleId: "cyc-2", oocyteId: "oocyte-9", itemId: "vitri-media", lotNo: "LOT-A", step: "fertilisation", quantity: 2, appliedAt: T });
    // a DIFFERENT lot of the same product must not appear in LOT-A's recall
    await emb.embryology.recordMediaApplication({ cycleId: "cyc-3", embryoId: "embryo-3", itemId: "vitri-media", lotNo: "LOT-B", step: "vitrification", quantity: 1, appliedAt: T });

    const recall = await emb.embryology.mediaRecall({ itemId: "vitri-media", lotNo: "LOT-A" });
    expect(recall.applicationCount).toBe(3);
    expect([...recall.embryoIds].sort()).toEqual(["embryo-1", "embryo-2"]);
    expect(recall.oocyteIds).toEqual(["oocyte-9"]);
    expect([...recall.cycleIds].sort()).toEqual(["cyc-1", "cyc-2"]);

    const recallB = await emb.embryology.mediaRecall({ itemId: "vitri-media", lotNo: "LOT-B" });
    expect(recallB.cycleIds).toEqual(["cyc-3"]);
    expect(recallB.embryoIds).toEqual(["embryo-3"]);
  });

  it("rejects a malformed application (no subject / non-positive quantity)", async () => {
    await expectCode(() => emb.embryology.recordMediaApplication({ cycleId: "cyc-1", itemId: "media-1", lotNo: "LOT-A", step: "culture", quantity: 1, appliedAt: T }), "BAD_REQUEST");
    await expectCode(() => emb.embryology.recordMediaApplication({ cycleId: "cyc-1", embryoId: "e1", itemId: "media-1", lotNo: "LOT-A", step: "culture", quantity: 0, appliedAt: T }), "BAD_REQUEST");
  });

  it("RBAC: a clinical role cannot record media applications or run a recall", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.embryology.recordMediaApplication({ cycleId: "cyc-1", embryoId: "e1", itemId: "media-1", lotNo: "LOT-A", step: "culture", quantity: 1, appliedAt: T }), "FORBIDDEN");
    await expectCode(() => doc.embryology.mediaRecall({ itemId: "media-1", lotNo: "LOT-A" }), "FORBIDDEN");
  });
});
