// e2e — patient portal documents & consents to sign THROUGH the tRPC API on real
// Postgres (docs/01 §E13). Proves: a patient sees the outstanding consents for an
// owned cycle and e-signs them (signature = the patient principal, audited); only
// required consents are signable; own-cycle/own-data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("portal consents to sign (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, fertility.cycle, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists outstanding consents and lets the patient e-sign them; only required ones; own-cycle only", async () => {
    const actor = "doc-1";
    const husband = await services.registry.registerPerson(actor, { name: N("Ali"), civilId: "284010199001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const wife = await services.registry.registerPerson(actor, { name: N("Noura"), civilId: "288050199002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const couple = await services.registry.createCouple(actor, husband.id, wife.id);
    if (!couple.ok) throw new Error("couple");
    await services.registry.verifyMarriage(actor, couple.value.id, { documentRef: "m1", method: "certificate" });
    const cyc = await services.cycle.createTreatmentCycle(actor, "icsi", couple.value.id);
    if (!cyc.ok) throw new Error("cycle");
    const cycleId = cyc.value.id;

    const me = appRouter.createCaller({ session: null, patient: { patientId: wife.id }, services });
    // ICSI requires: consent.icsi, consent.anaesthesia, consent.data_processing
    const before = await me.portal.outstandingConsents({ patientId: wife.id, cycleId });
    expect([...before.outstanding].sort()).toEqual(["consent.anaesthesia", "consent.data_processing", "consent.icsi"]);
    expect(before.signed).toEqual([]);

    // sign one → outstanding shrinks, signed grows
    const after = await me.portal.signConsent({ patientId: wife.id, cycleId, consentKey: "consent.icsi" });
    expect(after.signed).toContain("consent.icsi");
    expect(after.outstanding).not.toContain("consent.icsi");

    // a non-required consent key is rejected
    await expectCode(() => me.portal.signConsent({ patientId: wife.id, cycleId, consentKey: "consent.bogus" }), "BAD_REQUEST");

    // a stranger (not on the couple) cannot see or sign
    const stranger = appRouter.createCaller({ session: null, patient: { patientId: "stranger-1" }, services });
    await expectCode(() => stranger.portal.outstandingConsents({ patientId: "stranger-1", cycleId }), "FORBIDDEN");
    await expectCode(() => stranger.portal.signConsent({ patientId: "stranger-1", cycleId, consentKey: "consent.icsi" }), "FORBIDDEN");
  });
});
