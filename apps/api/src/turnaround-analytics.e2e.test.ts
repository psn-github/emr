// e2e — bed turnaround + theatre-utilisation analytics THROUGH the tRPC API on
// real Postgres (docs/01 §E7 P1). Turnaround returns a cleaning bed to the pool;
// utilisation reports a theatre's booked/idle minutes for a day.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedFacility } from "@oxford/facility";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const ops: Session = {
  sessionId: "s-ops",
  subject: { staffId: "ops-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};
const surgeon: Session = {
  sessionId: "s-surg",
  subject: { staffId: "surg-1", roles: [{ id: "surgeon", name: "surgeon", permissions: ["clinical:*"] }] },
  mfa: true,
};
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("bed turnaround + theatre utilisation (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, scheduling.resource, scheduling.appointment_type, scheduling.appointment, perioperative.theatre_case");
    services = buildServices(pool);
    await seedFacility(services.facility);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("housekeeping turns a cleaning bed back to free", async () => {
    const opsApi = appRouter.createCaller({ session: ops, patient: null, services });
    // drive a bed free → occupied → cleaning
    const bed = (await services.facility.beds())[0]!;
    await services.facility.setBedStatus("n", bed.id, "occupied");
    await services.facility.setBedStatus("n", bed.id, "cleaning");
    expect((await opsApi.flow.bedsAwaitingTurnaround()).beds.length).toBeGreaterThanOrEqual(1);

    const r = await opsApi.flow.completeTurnaround({ bedId: bed.id });
    expect(r.status).toBe("free");
    expect((await opsApi.flow.bedsAwaitingTurnaround()).beds.some((b) => b.bedId === bed.id)).toBe(false);
  });

  it("reports a theatre's utilisation + turnaround for a day", async () => {
    const doc = appRouter.createCaller({ session: surgeon, patient: null, services });
    const theatre = await services.scheduling.addResource("theatre", N("Theatre 1"), { level: "L1" });
    const surg = await services.scheduling.addResource("practitioner", N("Surgeon"));
    const type = await services.scheduling.addAppointmentType(N("Case"), 60, ["theatre", "practitioner"]);
    const base = { typeId: type.id, theatreResourceId: theatre.id, surgeonResourceId: surg.id, scheduledDate: "2026-06-25" };
    await doc.perioperative.scheduleCase({ ...base, patientId: "p1", procedure: "a", start: "2026-06-25T09:00:00.000Z", end: "2026-06-25T10:00:00.000Z" });
    await doc.perioperative.scheduleCase({ ...base, patientId: "p2", procedure: "b", start: "2026-06-25T10:30:00.000Z", end: "2026-06-25T11:30:00.000Z" });

    const u = await doc.perioperative.theatreUtilisation({ theatreResourceId: theatre.id, scheduledDate: "2026-06-25", availableMinutes: 480 });
    expect(u).toMatchObject({ caseCount: 2, bookedMinutes: 120, turnaroundMinutes: 30, utilisationPct: 25 });
  });
});
