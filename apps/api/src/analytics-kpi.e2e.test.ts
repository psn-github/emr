// e2e — Vienna-consensus lab KPIs + outcome reporting THROUGH the tRPC API on
// real Postgres (docs/01 §E12, ADR-0039). Seeds a real ICSI cycle in the lab,
// then reads KPIs (with competency/benchmark bands) and the cycle outcome via the
// reporting API. RBAC: reporting is its own clinical domain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const lead: Session = { sessionId: "s-md", subject: { staffId: "md-1", roles: [{ id: "md", name: "md", permissions: ["clinical:*", "embryology:*"] }] }, mfa: true };
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

const C = "cycle-kpi-1";

describe.skipIf(!DATABASE_URL)("lab KPIs + outcome reporting (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE embryology.oocyte, embryology.insemination, embryology.fertilisation_check, embryology.embryo, embryology.grading_entry, outcomes.pregnancy_test, outcomes.clinical_assessment, outcomes.pregnancy_outcome");
    services = buildServices(pool);
    api = appRouter.createCaller({ session: lead, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("computes lab KPIs with bands from a seeded cycle, and the cycle outcome", async () => {
    // seed the lab: 4 MII oocytes (of 5), 4 inseminated, 3 × 2PN, 2 blastocysts
    const emb = services.embryology;
    const maturities = ["MII", "MII", "MII", "MII", "GV"] as const;
    const oocytes = [];
    for (let i = 0; i < maturities.length; i++) {
      oocytes.push(await emb.recordOocyte("md-1", { cycleId: C, retrievalProcedureId: "p", maturity: maturities[i]!, dish: "D", position: String(i) }));
    }
    const twoPnEmbryos = [];
    for (let i = 0; i < 4; i++) {
      await emb.recordInsemination("md-1", { cycleId: C, oocyteId: oocytes[i]!.id, method: "ICSI", spermSourceId: "s", operator: "md-1", inseminatedAt: "2026-06-22T08:00:00Z", patientId: "pat-1" });
      const pn = i < 3 ? "2PN" : "1PN";
      const chk = await emb.recordFertilisationCheck("md-1", { cycleId: C, oocyteId: oocytes[i]!.id, pn, checkedAt: "2026-06-23T08:00:00Z" });
      if (chk.embryo) twoPnEmbryos.push(chk.embryo);
    }
    // grade 2 of the 3 embryos to blastocyst
    for (let i = 0; i < 2; i++) {
      await emb.recordGrading("md-1", { embryoId: twoPnEmbryos[i]!.id, day: 5, morphology: "blast", gardner: { expansion: 4, icm: "A", te: "B" }, assessedAt: "2026-06-27T08:00:00Z" });
    }

    const rep = await api.analytics.cycleLabKpis({ cycleId: C });
    expect(rep.counts).toEqual({ oocytesRetrieved: 5, maturedOocytes: 4, inseminated: 4, twoPn: 3, blastocysts: 2 });
    const byKey = Object.fromEntries(rep.kpis.map((k) => [k.key, k]));
    expect(byKey.maturation_rate!.value).toBe(0.8); // 4/5 → competency (≥0.75, <0.85)
    expect(byKey.maturation_rate!.band).toBe("competency");
    expect(byKey.fertilisation_rate!.value).toBe(0.75); // 3/4 → competency (≥0.65, <0.8)
    expect(byKey.blastulation_rate!.value).toBeCloseTo(0.6667, 3); // 2/3 → benchmark (≥0.4)
    expect(byKey.blastulation_rate!.band).toBe("benchmark");

    // outcome: record a clinical pregnancy then a live birth for the cycle
    await services.outcomes.recordPregnancyOutcome("md-1", { cycleId: C, type: "live_birth", liveBirthCount: 1, occurredAt: "2027-03-01T00:00:00Z" });
    const outcome = await api.analytics.cycleOutcome({ cycleId: C });
    expect(outcome.cycles).toBe(1);
    expect(outcome.liveBirthRate).toBe(1);
  });

  it("RBAC: reporting requires the clinical reports permission", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.analytics.cycleLabKpis({ cycleId: C }), "FORBIDDEN");
    await expectCode(() => rec.analytics.labKpis({ oocytesRetrieved: 1, maturedOocytes: 1, inseminated: 1, twoPn: 1, blastocysts: 1 }), "FORBIDDEN");
  });
});
