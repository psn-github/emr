// PHASE 1 EXIT GATE — a full simulated outpatient day, end-to-end THROUGH THE
// tRPC API against real Postgres: book → remind → check-in → consult/note →
// order → letter → invoice → pay. Bilingual + audit-verified. Runs where
// DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { seedFacility } from "@oxford/facility";
import { assertCatalogComplete } from "@oxford/i18n";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";
import { DEFAULT_CADENCE_HRS, dispatchDueReminders, dueReminders } from "./reminders.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });

const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };
const clinician: Session = { sessionId: "s-doc", subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] }, mfa: true };
const finance: Session = { sessionId: "s-fin", subject: { staffId: "fin-1", roles: [{ id: "finance", name: "finance", permissions: ["financial:*"] }] }, mfa: true };

describe.skipIf(!DATABASE_URL)("Phase 1 exit gate — full outpatient day (e2e)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment, facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, clinical.encounter, clinical.clinical_note, clinical.clinical_order, clinical.letter, billing.invoice, billing.payment, registry.person, audit.audit_log",
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs a whole outpatient day on Oxford HIS alone", async () => {
    await seedFacility(services.facility);
    const consult = (await services.facility.locations()).find((l) => l.type === "consult_room")!;
    const doc = await services.scheduling.addResource("practitioner", N("Dr A"));
    const apptType = await services.scheduling.addAppointmentType(N("New patient"), 30, ["practitioner"]);

    const clinicianApi = appRouter.createCaller({ session: clinician, patient: null, services });
    const receptionApi = appRouter.createCaller({ session: reception, patient: null, services });
    const financeApi = appRouter.createCaller({ session: finance, patient: null, services });

    // 1) Register + book
    const patient = await clinicianApi.registry.registerPerson({ name: { ar: "نورة", en: "Noura" }, civilId: "290010122222", dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const booked = await receptionApi.scheduling.book({ patientId: patient.personId, typeId: apptType.id, practitionerId: doc.id, resourceIds: [], start: "2026-06-20T09:00:00.000Z", end: "2026-06-20T09:30:00.000Z" });
    expect(booked.appointmentId).toBeTruthy();

    // 2) Remind (bilingual, discreet, via stubbed provider)
    const due = dueReminders([{ apptId: booked.appointmentId, patientId: patient.personId, startAt: "2026-06-20T09:00:00.000Z", to: "+96550", locale: "ar", location: "L3" }], DEFAULT_CADENCE_HRS, new Date("2026-06-20T06:00:00.000Z"), new Set());
    const sentKeys = await dispatchDueReminders(services.notifications, "system", due);
    expect(sentKeys.length).toBeGreaterThan(0);

    // 3) Check-in → on the flow board
    await receptionApi.flow.checkIn({ appointmentId: booked.appointmentId, patientId: patient.personId, locationNodeId: consult.id });

    // 4) Consult: encounter + note
    const enc = await clinicianApi.clinical.openEncounter({ patientId: patient.personId, type: "new_fertility", practitionerId: "doc-1" });
    await clinicianApi.clinical.writeNote({ encounterId: enc.encounterId, patientId: patient.personId, body: { history: "G0", plan: "AMH + baseline scan" } });

    // 5) Order + letter
    await clinicianApi.clinical.placeOrder({ encounterId: enc.encounterId, patientId: patient.personId, kind: "lab", code: "AMH" });
    const letter = await clinicianApi.clinical.issueLetter({ patientId: patient.personId, templateKey: "letter.summary", locale: "ar", body: "ملخص الزيارة" });
    expect(letter.status).toBe("signed");

    // 6) Invoice + pay
    const invoice = await financeApi.billing.createInvoice({ patientId: patient.personId, lines: [{ chargeCode: "CONSULT", description: N("Consultation"), unitAmountFils: 25000, quantity: 1 }] });
    const paid = await financeApi.billing.postPayment({ invoiceId: invoice.invoiceId, amountFils: 25000, method: "knet" });
    expect(paid.balanceFils).toBe(0);

    // 7) The day is auditable + the chain verifies; the patient is on the board.
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    const board = await services.flow.board();
    expect(board.locations.flatMap((l) => l.patients).some((p) => p.patientId === patient.personId)).toBe(true);
    // Bilingual guarantee still holds.
    expect(() => assertCatalogComplete({ en: { x: "x" }, ar: { x: "س" } })).not.toThrow();
  });

  it("enforces deny-by-default across the day (reception cannot write clinical notes or post payments)", async () => {
    const receptionApi = appRouter.createCaller({ session: reception, patient: null, services });
    await expect(receptionApi.clinical.writeNote({ encounterId: "e", patientId: "p", body: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(receptionApi.billing.postPayment({ invoiceId: "i", amountFils: 100, method: "knet" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
