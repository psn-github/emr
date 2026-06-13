// CROSS-CUTTING e2e — the cryostore thaw-for-treatment re-gate THROUGH the tRPC
// API against real Postgres, with the ownership facts coming from the REAL
// registry (couple membership + verification + the clinician-attested death
// record). Proves the no-posthumous-use invariant end-to-end now that the
// vital-status source exists (Medical Director decision, 2026-06-13).
//
// Attacks attempted:
//   A1. Thaw a person-owned specimen whose owner has an attested DEATH record.
//   A2. Thaw a person-owned specimen into a couple that excludes the owner.
//   A3. RBAC — a reception role cannot attest death nor thaw.
//   A4. The legitimate thaw (living owner, in a verified couple) flows.
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

describe.skipIf(!DATABASE_URL)("cryostore thaw re-gate (e2e via the API + real registry vital status)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let lead: ReturnType<typeof appRouter.createCaller>;

  const male = (civilId: string) => ({ name: { ar: "رجل", en: "Man" }, civilId, dob: "1985-01-01", sex: "male" as const, nationality: "KW", languagePref: "ar" as const });
  const female = (civilId: string) => ({ name: { ar: "امرأة", en: "Woman" }, civilId, dob: "1988-01-01", sex: "female" as const, nationality: "KW", languagePref: "ar" as const });
  const pos = (position: string) => ({ tankId: "t1", canister: "c1", cane: "k1", position });

  async function verifiedCouple(hCivil: string, wCivil: string) {
    const h = await lead.registry.registerPerson(male(hCivil));
    const w = await lead.registry.registerPerson(female(wCivil));
    const c = await lead.registry.createCouple({ husbandPersonId: h.personId, wifePersonId: w.personId });
    await lead.registry.verifyMarriage({ coupleId: c.coupleId, documentRef: "mrg", method: "certificate" });
    return { husbandId: h.personId, wifeId: w.personId, coupleId: c.coupleId };
  }

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, registry.death_record");
    await pool.query("TRUNCATE cryostore.cryo_specimen, cryostore.custody_event, cryostore.storage_consent, cryostore.engagement");
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    services = buildServices(pool);
    lead = appRouter.createCaller({ session: labLead, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function freezePersonOwnedSperm(ownerId: string, position: string) {
    const r = await lead.cryostore.freeze({ kind: "sperm", owner: { kind: "person", id: ownerId }, cycleId: "cycle-1", straws: 2, position: pos(position), freezeEventRef: "fz", patientId: ownerId, occurredAt: "2026-06-22T08:00:00Z" });
    return r.specimenId;
  }

  it("A4 + A1: a living owner's specimen thaws; once death is attested, it is BLOCKED", async () => {
    const { husbandId, coupleId } = await verifiedCouple("284010100101", "288010100102");

    // A4 — legitimate thaw (husband living, in the verified couple).
    const living = await freezePersonOwnedSperm(husbandId, "p1");
    const ok = await lead.cryostore.thaw({ specimenId: living, coupleId, patientId: husbandId, occurredAt: "2026-06-27T10:00:00Z" });
    expect(ok.status).toBe("thawed");

    // A1 — a second specimen, owner now has an attested death record → BLOCKED.
    const preserved = await freezePersonOwnedSperm(husbandId, "p2");
    await lead.registry.recordDeath({ personId: husbandId, dateOfDeath: "2026-07-01", documentRef: "death-cert-1" });
    await expectCode(() => lead.cryostore.thaw({ specimenId: preserved, coupleId, patientId: husbandId, occurredAt: "2026-07-10T10:00:00Z" }), "FORBIDDEN");
    // and it is still in storage
    const loc = await lead.cryostore.locate({ specimenId: preserved });
    expect(loc.specimen.status).toBe("stored");
  });

  it("A2: a person-owned specimen cannot be thawed into a couple that excludes the owner", async () => {
    const a = await verifiedCouple("284010100201", "288010100202");
    const other = await verifiedCouple("284010100203", "288010100204");
    const specimen = await freezePersonOwnedSperm(a.husbandId, "p3");
    await expectCode(() => lead.cryostore.thaw({ specimenId: specimen, coupleId: other.coupleId, patientId: a.husbandId, occurredAt: "2026-07-10T10:00:00Z" }), "FORBIDDEN");
  });

  it("A3: a reception role cannot attest a death nor thaw", async () => {
    const { husbandId, coupleId } = await verifiedCouple("284010100301", "288010100302");
    const specimen = await freezePersonOwnedSperm(husbandId, "p4");
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.registry.recordDeath({ personId: husbandId, dateOfDeath: "2026-07-01", documentRef: "x" }), "FORBIDDEN");
    await expectCode(() => rec.cryostore.thaw({ specimenId: specimen, coupleId, patientId: husbandId, occurredAt: "2026-07-10T10:00:00Z" }), "FORBIDDEN");
  });
});
