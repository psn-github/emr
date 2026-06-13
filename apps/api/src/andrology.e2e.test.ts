// CROSS-CUTTING e2e — andrology THROUGH the tRPC API against real Postgres.
// Proves: (1) RBAC — andrology lab data sits in the embryology permission domain
// (a clinical role is denied); (2) WHO 6th-ed flagging surfaces correctly via the
// API; (3) a sperm freeze registers an RI-reconcilable witness record. Runs where
// DATABASE_URL is set.
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

const normal = { volumeMl: 2.5, concentrationMillionPerMl: 40, totalCountMillion: 100, progressiveMotilityPct: 45, totalMotilityPct: 60, normalMorphologyPct: 6, vitalityPct: 70 };
const oligo = { ...normal, concentrationMillionPerMl: 10 }; // below WHO 6th limit (16)

describe.skipIf(!DATABASE_URL)("andrology (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE andrology.semen_analysis, andrology.sperm_prep, andrology.sperm_freeze, andrology.surgical_retrieval");
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("RBAC: a clinical role cannot record andrology lab data", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.andrology.recordSemenAnalysis({ patientId: "pat-1", collectedAt: "2026-06-22T08:00:00Z", parameters: normal }), "FORBIDDEN");
  });

  it("WHO 6th-ed flags surface via the API (normal vs below-reference)", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    const ok = await emb.andrology.recordSemenAnalysis({ patientId: "pat-1", collectedAt: "2026-06-22T08:00:00Z", parameters: normal });
    expect(ok.allWithinReference).toBe(true);
    const low = await emb.andrology.recordSemenAnalysis({ patientId: "pat-1", collectedAt: "2026-06-22T08:00:00Z", parameters: oligo });
    expect(low.allWithinReference).toBe(false);
    expect(low.flags.concentration).toBe("below_reference");
  });

  it("a sperm freeze registers a witness record that RI reconciles as matched", async () => {
    const emb = appRouter.createCaller({ session: embryologist, patient: null, services });
    const f = await emb.andrology.recordFreeze({ cycleId: "cycle-1", patientId: "pat-1", cryoSpecimenRef: "cryo-9", straws: 4, frozenAt: "2026-06-22T10:00:00Z" });
    expect(f.witnessKey).toBe("cycle-1:freeze.sperm:cryo-9");
    services.witnessProvider.seedRecord("cycle-1", { riRecordId: "ri-1", oxfordKey: f.witnessKey, patientId: "pat-1", sampleId: "cryo-9", outcome: "witnessed", witnessedAt: "t" });
    const rows = await services.witnessing.ingest("emb-1", "cycle-1");
    expect(rows[0]!.status).toBe("matched");
  });
});
