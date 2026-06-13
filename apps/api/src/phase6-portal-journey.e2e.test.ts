// PHASE 6 EXIT GATE — a couple's patient-experience journey end-to-end, through
// the tRPC API on a real Postgres, exercising the §E13 acceptance in one flow:
//   the patient sees their CYCLE TIMELINE + next appointment; reads the MEDICATION
//   schedule with the injection-TEACHING video; SIGNS an outstanding consent; PAYS
//   via the KNET gateway; sees a clinician-RELEASED result (unreleased stays
//   hidden); MESSAGES the clinic; GRANTS a partner read access; registers for a
//   DISCREET (no-PHI) push — all OWN-DATA only, with the audit hash-chain intact.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });
const PHI = /IVF|ICSI|embryo|pregnan|fertil|جنين|حمل/i;

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("PHASE 6 EXIT GATE — patient portal journey end-to-end (real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, fertility.cycle, fertility.stim_day, scheduling.resource, scheduling.appointment_type, scheduling.appointment, billing.invoice, billing.payment, billing.instalment_plan, clinical.encounter, clinical.clinical_order, clinical.result, messaging.message_thread, messaging.message, consent.partner_access_grant, push.push_subscription, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs the full couple portal journey in Arabic, own-data, no PHI in push", async () => {
    const actor = "doc-1";
    // ── seed: couple + verified marriage + an ICSI cycle with a stim day ──────
    const husband = await services.registry.registerPerson(actor, { name: N("Ali"), civilId: "284010199001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const wife = await services.registry.registerPerson(actor, { name: N("Noura"), civilId: "288050199002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const couple = await services.registry.createCouple(actor, husband.id, wife.id);
    if (!couple.ok) throw new Error("couple");
    await services.registry.verifyMarriage(actor, couple.value.id, { documentRef: "m1", method: "certificate" });
    const cyc = await services.cycle.createTreatmentCycle(actor, "icsi", couple.value.id);
    if (!cyc.ok) throw new Error("cycle");
    const cycleId = cyc.value.id;
    await services.stim.recordDay(actor, cycleId, { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU", route: "SC" }] });

    // seed: a monitoring appointment, an instalment-plan invoice, a released result
    const doc = await services.scheduling.addResource("practitioner", N("Dr A"));
    const type = await services.scheduling.addAppointmentType(N("Monitoring"), 30, ["practitioner"]);
    await services.scheduling.book(actor, { typeId: type.id, patientId: wife.id, practitionerId: doc.id, resourceIds: [], start: "2026-06-22T09:00:00.000Z", end: "2026-06-22T09:30:00.000Z" });
    const inv = await services.billing.createInvoice(actor, wife.id, [{ chargeCode: "ICSI", description: N("ICSI cycle"), unitAmountFils: 1000000, quantity: 1 }]);
    if (!inv.ok) throw new Error("invoice");
    const enc = await services.clinical.openEncounter(actor, wife.id, "new_fertility", actor);
    const order = await services.clinical.placeOrder(actor, enc.id, wife.id, "lab", "AMH");
    const filed = await services.clinical.fileResult(actor, order.id, "AMH 1.2 ng/mL", false);
    if (!filed.ok) throw new Error("result");

    // ── the wife's portal journey ────────────────────────────────────────────
    const wifePortal = appRouter.createCaller({ session: null, patient: { patientId: wife.id }, services });

    // cycle timeline + next appointment
    expect((await wifePortal.portal.cycleTimeline({ patientId: wife.id, cycleId })).timeline.current).toBe("planned");
    expect((await wifePortal.portal.appointments({ patientId: wife.id })).appointments).toHaveLength(1);

    // medication schedule with the injection-teaching video
    const sched = await wifePortal.portal.medicationSchedule({ patientId: wife.id, cycleId });
    expect(sched.schedule[0]!.drugs[0]!.teachingVideoRef).toBe("video:injection/rfsh");

    // sign an outstanding consent
    const outstanding = await wifePortal.portal.outstandingConsents({ patientId: wife.id, cycleId });
    expect(outstanding.outstanding.length).toBeGreaterThan(0);
    await wifePortal.portal.signConsent({ patientId: wife.id, cycleId, consentKey: "consent.icsi" });
    expect((await wifePortal.portal.outstandingConsents({ patientId: wife.id, cycleId })).signed).toContain("consent.icsi");

    // a result is invisible until released; release it → visible
    expect((await wifePortal.portal.results({ patientId: wife.id })).results).toHaveLength(0);
    await services.clinical.releaseResult(actor, filed.value.id);
    expect((await wifePortal.portal.results({ patientId: wife.id })).results).toHaveLength(1);

    // pay a deposit via the KNET gateway (no cash)
    const pay = await wifePortal.portal.payInvoice({ patientId: wife.id, invoiceId: inv.value.id, amountFils: 300000, method: "knet" });
    expect(pay.balanceFils).toBe(700000);
    expect(pay.gatewayRef.startsWith("CHG-KNET-")).toBe(true);

    // message the clinic
    const thread = await wifePortal.portal.startThread({ patientId: wife.id, subject: N("Question").en, body: "When is my next scan?" });
    expect((await wifePortal.portal.threadMessages({ patientId: wife.id, threadId: thread.threadId })).messages).toHaveLength(1);

    // grant the husband (partner) read access → he can read her balances
    await wifePortal.portal.grantPartnerAccess({ patientId: wife.id, partnerId: husband.id });
    const husbandPortal = appRouter.createCaller({ session: null, patient: { patientId: husband.id }, services });
    expect((await husbandPortal.portal.balances({ patientId: wife.id })).invoices).toHaveLength(1);

    // register for discreet push → a dispatched push carries NO PHI
    await wifePortal.portal.registerPush({ patientId: wife.id, endpoint: "https://push/wife-device", locale: "ar" });
    await services.push.dispatch("system", wife.id, "result_available");
    expect(services.pushOutbox.outbox).toHaveLength(1);
    expect(PHI.test(services.pushOutbox.outbox[0]!.body)).toBe(false);

    // ── cross-cutting invariants ─────────────────────────────────────────────
    // a stranger can touch none of the wife's data
    const stranger = appRouter.createCaller({ session: null, patient: { patientId: "stranger-1" }, services });
    await expectCode(() => stranger.portal.results({ patientId: wife.id }), "FORBIDDEN");
    await expectCode(() => stranger.portal.cycleTimeline({ patientId: "stranger-1", cycleId }), "FORBIDDEN");
    // the audit hash-chain is intact across the whole journey
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });
});
