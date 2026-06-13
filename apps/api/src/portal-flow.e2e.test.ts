// e2e — portal booking → bilingual reminder → check-in (onto the flow board),
// through the tRPC API + real Postgres. Includes the patient own-data attack.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { seedFacility } from "@oxford/facility";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";
import { DEFAULT_CADENCE_HRS, dispatchDueReminders, dueReminders } from "./reminders.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("Portal booking → reminder → check-in (e2e)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment, facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, audit.audit_log");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a patient books for themselves, gets a discreet reminder, and is checked in", async () => {
    await seedFacility(services.facility);
    const consult = (await services.facility.locations()).find((l) => l.type === "consult_room")!;
    const doc = await services.scheduling.addResource("practitioner", N("Dr A"));
    const type = await services.scheduling.addAppointmentType(N("New patient"), 30, ["practitioner"]);

    const patientCaller = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });

    // ATTACK: pat-1 tries to book for pat-2 → forbidden (own-data only).
    await expectCode(
      () => patientCaller.portal.book({ patientId: "pat-2", typeId: type.id, practitionerId: doc.id, resourceIds: [], start: "2026-06-20T09:00:00.000Z", end: "2026-06-20T09:30:00.000Z" }),
      "FORBIDDEN",
    );

    // Patient books their own appointment.
    const booked = await patientCaller.portal.book({ patientId: "pat-1", typeId: type.id, practitionerId: doc.id, resourceIds: [], start: "2026-06-20T09:00:00.000Z", end: "2026-06-20T09:30:00.000Z" });
    expect(booked.appointmentId).toBeTruthy();

    // Bilingual reminder dispatched (T-3h), discreet.
    const target = { apptId: booked.appointmentId, patientId: "pat-1", startAt: "2026-06-20T09:00:00.000Z", to: "+96550001122", locale: "ar" as const, location: "L3" };
    const due = dueReminders([target], DEFAULT_CADENCE_HRS, new Date("2026-06-20T06:00:00.000Z"), new Set(["" + booked.appointmentId + ":48"]));
    const sent = await dispatchDueReminders(services.notifications, "system", due);
    expect(sent).toHaveLength(1);
    expect(services.notificationOutbox.outbox[0]!.body).not.toMatch(/IVF|embryo|جنين/i);

    // Front-desk checks the patient in → onto the flow board.
    const staff = appRouter.createCaller({ session: reception, patient: null, services });
    const res = await staff.flow.checkIn({ appointmentId: booked.appointmentId, patientId: "pat-1", locationNodeId: consult.id });
    expect(res).toEqual({ checkedIn: true });

    const board = await services.flow.board();
    expect(board.locations.flatMap((l) => l.patients).some((p) => p.patientId === "pat-1")).toBe(true);
  });
});
