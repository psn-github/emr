// e2e — the server-rendered print pack THROUGH the tRPC API on real Postgres
// (docs/PHASE8_PLAN §8.3, ADR-0068). Seeds minimal real data via existing routers
// (a KNET-paid invoice, a formulary prescription, an appointment, a theatre case,
// a signed letter, a pull-list day) then asserts each print.* returns HTML with the
// key facts in BOTH the en and ar passes (locale is an input param); the receipt
// shows NO tax anywhere; and a role without the permission is FORBIDDEN. Audit
// chain intact at the end. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const NAME = { en: "Sara Al-Ali", ar: "سارة العلي" };
const dose = { en: "225 IU daily", ar: "225 وحدة يومياً" };

const admin: Session = {
  sessionId: "s-admin",
  subject: { staffId: "admin-1", roles: [{ id: "admin", name: "admin", permissions: ["clinical:*", "scheduling:*", "financial:*"] }] },
  mfa: true,
};
const deskOnly: Session = {
  sessionId: "s-desk",
  subject: { staffId: "desk-1", roles: [{ id: "desk", name: "desk", permissions: ["scheduling:appointment.book"] }] },
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

/** Every print artefact is bilingual regardless of locale: both passes carry the
 *  en + ar patient name, and the doc dir follows the locale. */
function assertBothLocales(pair: { en: string; ar: string }): void {
  for (const [locale, html] of [["en", pair.en], ["ar", pair.ar]] as const) {
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    expect(html).toContain(NAME.en);
    expect(html).toContain(NAME.ar);
  }
}

describe.skipIf(!DATABASE_URL)("print pack (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE billing.invoice, billing.payment, pharmacy.prescription, pharmacy.dispense, scheduling.appointment, scheduling.resource, scheduling.appointment_type, registry.person, records.mrn_counter, records.mrn_assignment, records.patient_file, records.file_movement, clinical.letter, perioperative.theatre_case, audit.audit_log",
    );
    services = buildServices(pool);
    api = appRouter.createCaller({ session: admin, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function registerWithFile(civilId: string): Promise<string> {
    const p = await api.registry.registerPerson({ name: NAME, civilId, dob: "1990-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    await api.records.assignMrn({ personId: p.personId });
    await api.records.openFile({ personId: p.personId, homeLocation: "Records/A-1" });
    return p.personId;
  }

  it("receipt: renders a KNET receipt in both locales with NO tax anywhere", async () => {
    const patientId = await registerWithFile("290050100001");
    const inv = await api.billing.createInvoice({ patientId, lines: [{ chargeCode: "CONSULT", description: { en: "Consultation", ar: "استشارة" }, unitAmountFils: 25_000, quantity: 1 }] });
    await api.billing.postPayment({ invoiceId: inv.invoiceId, amountFils: 25_000, method: "knet" });

    const en = (await api.print.receipt({ invoiceId: inv.invoiceId, locale: "en" })).html;
    const ar = (await api.print.receipt({ invoiceId: inv.invoiceId, locale: "ar" })).html;
    assertBothLocales({ en, ar });
    for (const html of [en, ar]) {
      expect(html).toContain("Consultation");
      expect(html).toContain("استشارة");
      expect(html).toContain("25.000 KWD");
      expect(html).toContain("KNET");
      // NO tax (ADR-0035) and NO cash (ADR-0034) anywhere on the receipt.
      expect(html.toLowerCase()).not.toContain("tax");
      expect(html).not.toContain("ضريبة");
      expect(html.toLowerCase()).not.toContain("cash");
    }
  });

  it("prescription: renders formulary drug + bilingual dose in both locales", async () => {
    const patientId = await registerWithFile("290050100002");
    const rx = await api.pharmacy.raisePrescription({ patientId, items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }] });
    const en = (await api.print.prescription({ prescriptionId: rx.prescriptionId, locale: "en" })).html;
    const ar = (await api.print.prescription({ prescriptionId: rx.prescriptionId, locale: "ar" })).html;
    assertBothLocales({ en, ar });
    for (const html of [en, ar]) {
      expect(html).toContain("225 IU daily");
      expect(html).toContain("225 وحدة يومياً");
    }
  });

  it("appointment slip: renders type + practitioner + patient in both locales", async () => {
    const patientId = await registerWithFile("290050100003");
    // Seed a real resource + type via the service (no config router surface), then
    // book through the router so the slip resolves real bilingual names.
    const prac = await services.scheduling.addResource("practitioner", { en: "Dr Nelson", ar: "د. نيلسون" });
    const type = await services.scheduling.addAppointmentType({ en: "Monitoring scan", ar: "أشعة متابعة" }, 30, ["practitioner"]);
    const booked = await api.scheduling.book({ patientId, typeId: type.id, practitionerId: prac.id, resourceIds: [], start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:30:00.000Z" });
    const en = (await api.print.appointmentSlip({ appointmentId: booked.appointmentId, locale: "en" })).html;
    const ar = (await api.print.appointmentSlip({ appointmentId: booked.appointmentId, locale: "ar" })).html;
    assertBothLocales({ en, ar });
    for (const html of [en, ar]) {
      expect(html).toContain("Monitoring scan");
      expect(html).toContain("أشعة متابعة");
      expect(html).toContain("Dr Nelson");
    }
  });

  it("clinical letter: renders letterhead + body in both locales", async () => {
    const patientId = await registerWithFile("290050100004");
    const letter = await api.clinical.issueLetter({ patientId, templateKey: "letter.referral", locale: "en", body: "To whom it may concern,\nThis confirms treatment at the clinic." });
    const en = (await api.print.letter({ letterId: letter.letterId, locale: "en" })).html;
    const ar = (await api.print.letter({ letterId: letter.letterId, locale: "ar" })).html;
    assertBothLocales({ en, ar });
    for (const html of [en, ar]) {
      expect(html).toContain("To whom it may concern,");
      expect(html).toContain("letter.referral");
    }
  });

  it("theatre list: renders the day's cases in both locales", async () => {
    const patientId = await registerWithFile("290050100005");
    await api.perioperative.scheduleCase({ typeId: "type-theatre", patientId, procedure: "Oocyte retrieval", theatreResourceId: "theatre-1", surgeonResourceId: "surgeon-1", scheduledDate: "2026-09-05", start: "2026-09-05T08:00:00.000Z", end: "2026-09-05T09:00:00.000Z" });
    const en = (await api.print.theatreList({ date: "2026-09-05", locale: "en" })).html;
    const ar = (await api.print.theatreList({ date: "2026-09-05", locale: "ar" })).html;
    assertBothLocales({ en, ar });
    for (const html of [en, ar]) {
      expect(html).toContain("Oocyte retrieval");
      expect(html).toContain("2026-09-05");
    }
  });

  it("pull list: renders tomorrow's files in both locales", async () => {
    const patientId = await registerWithFile("290050100006");
    await api.scheduling.book({ patientId, typeId: "type-1", practitionerId: "res-1", resourceIds: [], start: "2026-09-11T09:00:00.000Z", end: "2026-09-11T09:30:00.000Z" });
    const en = (await api.print.pullList({ date: "2026-09-11", locale: "en" })).html;
    const ar = (await api.print.pullList({ date: "2026-09-11", locale: "ar" })).html;
    assertBothLocales({ en, ar });
    expect(en).toContain("OM-2026-00001");
    expect(en).toContain("Records/A-1");

    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });

  it("RBAC: a role without the underlying permission is FORBIDDEN the print route", async () => {
    const patientId = await registerWithFile("290050100007");
    const inv = await api.billing.createInvoice({ patientId, lines: [{ chargeCode: "CONSULT", description: { en: "Consultation", ar: "استشارة" }, unitAmountFils: 25_000, quantity: 1 }] });
    const desk = appRouter.createCaller({ session: deskOnly, patient: null, services });
    await expectCode(() => desk.print.receipt({ invoiceId: inv.invoiceId }), "FORBIDDEN");
    await expectCode(() => desk.print.prescription({ prescriptionId: "x" }), "FORBIDDEN");
    await expectCode(() => desk.print.pullList({ date: "2026-09-11" }), "FORBIDDEN");
  });
});
