// CROSS-CUTTING e2e — the marital-status-change disposition pathway THROUGH the
// tRPC API against real Postgres (AMD-0004). Proves: dissolving a couple OPENS a
// disposition review of its specimens but NEVER auto-disposes; resolution is an
// explicit human decision (retain / witnessed-discard) with a rationale; RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const labLead: Session = {
  sessionId: "s-lead",
  subject: { staffId: "lead-1", roles: [{ id: "lab-lead", name: "lab-lead", permissions: ["clinical:*", "embryology:*", "financial:*"] }] },
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

describe.skipIf(!DATABASE_URL)("cryostore marital-status disposition (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let lead: ReturnType<typeof appRouter.createCaller>;

  const male = (civilId: string) => ({ name: { ar: "ر", en: "M" }, civilId, dob: "1985-01-01", sex: "male" as const, nationality: "KW", languagePref: "ar" as const });
  const female = (civilId: string) => ({ name: { ar: "م", en: "W" }, civilId, dob: "1988-01-01", sex: "female" as const, nationality: "KW", languagePref: "ar" as const });

  async function verifiedCoupleWithEmbryo(hCivil: string, wCivil: string, position: string) {
    const h = await lead.registry.registerPerson(male(hCivil));
    const w = await lead.registry.registerPerson(female(wCivil));
    const c = await lead.registry.createCouple({ husbandPersonId: h.personId, wifePersonId: w.personId });
    await lead.registry.verifyMarriage({ coupleId: c.coupleId, documentRef: "mrg", method: "certificate" });
    const s = await lead.cryostore.freeze({ kind: "embryo", owner: { kind: "couple", id: c.coupleId }, cycleId: "cycle-1", straws: 1, position: { tankId: "t1", canister: "c1", cane: "k1", position }, freezeEventRef: "fz", patientId: w.personId, occurredAt: "2026-06-22T08:00:00Z" });
    return { coupleId: c.coupleId, specimenId: s.specimenId, patientId: w.personId };
  }

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, registry.death_record");
    await pool.query("TRUNCATE cryostore.cryo_specimen, cryostore.custody_event, cryostore.disposition_review, cryostore.engagement");
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    services = buildServices(pool);
    lead = appRouter.createCaller({ session: labLead, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("dissolution opens a review but does NOT auto-dispose; retain keeps it stored", async () => {
    const { coupleId, specimenId, patientId } = await verifiedCoupleWithEmbryo("284010100401", "288010100402", "p1");
    const d = await lead.registry.dissolveCouple({ coupleId, reason: "divorce" });
    expect(d).toMatchObject({ status: "dissolved", reviewsOpened: 1 });
    // specimen is flagged for review but STILL stored — never auto-destroyed
    expect((await lead.cryostore.locate({ specimenId })).specimen.status).toBe("stored");

    const r = await lead.cryostore.resolveDispositionReview({ specimenId, outcome: "retain", rationale: "both partners consent to retain", patientId, occurredAt: "2026-08-01T10:00:00Z" });
    expect(r).toMatchObject({ state: "resolved", outcome: "retain" });
    expect((await lead.cryostore.locate({ specimenId })).specimen.status).toBe("stored");
  });

  it("a reviewed discard outcome routes through the witnessed discard", async () => {
    const { coupleId, specimenId, patientId } = await verifiedCoupleWithEmbryo("284010100403", "288010100404", "p2");
    await lead.registry.dissolveCouple({ coupleId, reason: "annulment" });
    const r = await lead.cryostore.resolveDispositionReview({ specimenId, outcome: "discard", rationale: "court order ref 12/2026", patientId, occurredAt: "2026-08-01T10:00:00Z" });
    expect(r.outcome).toBe("discard");
    expect((await lead.cryostore.locate({ specimenId })).specimen.status).toBe("discarded");
  });

  it("RBAC: a reception role cannot dissolve a couple nor resolve a disposition review", async () => {
    const { coupleId, specimenId, patientId } = await verifiedCoupleWithEmbryo("284010100405", "288010100406", "p3");
    await lead.registry.dissolveCouple({ coupleId, reason: "divorce" });
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.registry.dissolveCouple({ coupleId, reason: "x" }), "FORBIDDEN");
    await expectCode(() => rec.cryostore.resolveDispositionReview({ specimenId, outcome: "discard", rationale: "x", patientId, occurredAt: "2026-08-01T10:00:00Z" }), "FORBIDDEN");
  });
});
