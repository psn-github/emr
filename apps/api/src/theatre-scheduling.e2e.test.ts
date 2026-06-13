// CROSS-CUTTING e2e — two-theatre case scheduling THROUGH the tRPC API on real
// Postgres. Proves: a case books the theatre on the SHARED resource calendar
// (a second case in the same theatre/time is rejected as a conflict); each case
// provisionally reserves an L2 bed and the day is FLAGGED when the list exceeds
// the 6 L2 beds; RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};
const N = (en: string) => ({ ar: en, en });

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("theatre scheduling (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;
  let theatreId: string;
  let surgeonId: string;
  let typeId: string;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment, perioperative.theatre_case, audit.audit_log");
    services = buildServices(pool);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
    const theatre = await services.scheduling.addResource("theatre", N("Theatre 1"), { level: "L1" });
    const surgeon = await services.scheduling.addResource("practitioner", N("Surgeon A"));
    const type = await services.scheduling.addAppointmentType(N("Theatre case"), 60, ["theatre", "practitioner"]);
    theatreId = theatre.id;
    surgeonId = surgeon.id;
    typeId = type.id;
  });
  afterAll(async () => {
    await pool.end();
  });

  const caseInput = (over: Record<string, unknown> = {}) => ({
    typeId,
    patientId: "pat-1",
    procedure: "hysteroscopy",
    theatreResourceId: theatreId,
    surgeonResourceId: surgeonId,
    scheduledDate: "2026-06-25",
    start: "2026-06-25T09:00:00.000Z",
    end: "2026-06-25T10:00:00.000Z",
    ...over,
  });

  it("books a case on the shared calendar and rejects a clashing one", async () => {
    const a = await doc.perioperative.scheduleCase(caseInput());
    expect(a.bedReservation.exceedsBeds).toBe(false);
    // same theatre, overlapping time → conflict on the shared resource calendar
    await expectCode(() => doc.perioperative.scheduleCase(caseInput({ patientId: "pat-2" })), "CONFLICT");
  });

  it("flags the day when the list would exceed the 6 L2 beds", async () => {
    // 7 non-overlapping cases in the same theatre on one day → 7th flags overflow
    let last;
    for (let i = 0; i < 7; i++) {
      const hh = String(7 + i).padStart(2, "0");
      last = await doc.perioperative.scheduleCase(caseInput({ patientId: `pat-${i}`, start: `2026-06-25T${hh}:00:00.000Z`, end: `2026-06-25T${hh}:45:00.000Z` }));
    }
    expect(last!.bedReservation).toMatchObject({ reserved: 7, capacity: 6, exceedsBeds: true });
    const day = await doc.perioperative.dayList({ scheduledDate: "2026-06-25" });
    expect(day.bedReservation.exceedsBeds).toBe(true);
  });

  it("RBAC: a reception role cannot schedule a theatre case", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.scheduleCase(caseInput()), "FORBIDDEN");
  });
});
