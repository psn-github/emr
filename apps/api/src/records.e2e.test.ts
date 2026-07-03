// e2e — paper medical records & filing THROUGH the tRPC API on real Postgres
// (docs/PHASE8_PLAN §8.0, ADR-0065). Proves the whole paper day: assign MRN →
// open file → pull list surfaces tomorrow's booked patient → check out to L3 →
// transfer to L1 → overdue detection → check in → archive blocks check-out →
// bilingual labels render (MRN + Arabic name present, civil ID ABSENT) → the
// audit hash-chain stays intact. Plus RBAC: a role without clinical:records.* is
// FORBIDDEN. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const CIVIL_ID = "290050112345"; // never appears on a label

const officer: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-files-1", roles: [{ id: "records-officer", name: "records-officer", permissions: ["clinical:records.read", "clinical:records.write", "scheduling:appointment.book"] }] },
  mfa: true,
};
const bookingOnly: Session = {
  sessionId: "s-desk",
  subject: { staffId: "desk-1", roles: [{ id: "desk", name: "desk", permissions: ["scheduling:*"] }] },
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

describe.skipIf(!DATABASE_URL)("paper records & filing (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let rec: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE records.mrn_counter, records.mrn_assignment, records.patient_file, records.file_movement, scheduling.appointment");
    services = buildServices(pool);
    rec = appRouter.createCaller({ session: officer, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs the full paper day and keeps the audit chain intact", async () => {
    const personId = "pat-rec-1";

    // MRN allocation (idempotent) + open the physical file
    const mrn = await rec.records.assignMrn({ personId });
    expect(mrn).toEqual({ mrn: "OM-2026-00001", alreadyAssigned: false });
    expect(await rec.records.assignMrn({ personId })).toEqual({ mrn: "OM-2026-00001", alreadyAssigned: true });
    const file = await rec.records.openFile({ personId, homeLocation: "Records/A-1" });
    expect(file.volume).toBe(1);

    // tomorrow's booking → pull list surfaces this patient's file (at home, not out)
    await rec.scheduling.book({ patientId: personId, typeId: "type-1", practitionerId: "res-doc-1", resourceIds: [], start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:30:00.000Z" });
    const pull = await rec.records.pullList({ date: "2026-09-10" });
    expect(pull.files).toHaveLength(1);
    expect(pull.files[0]).toMatchObject({ mrn: "OM-2026-00001", volume: 1, alreadyOut: false, currentLocation: "Records/A-1" });

    // check out to L3, then transfer directly to L1 (how files move between floors)
    await rec.records.checkOut({ fileId: file.fileId, toLocation: "L3/Consult-2", toStaffId: "nurse-9" });
    await expectCode(() => rec.records.checkOut({ fileId: file.fileId, toLocation: "L1" }), "CONFLICT"); // already out
    await rec.records.transfer({ fileId: file.fileId, toLocation: "L1/Theatre-1", toStaffId: "porter-3" });
    const where = await rec.records.whereIs({ fileId: file.fileId });
    expect(where).toMatchObject({ out: true, currentLocation: "L1/Theatre-1", holderStaffId: "porter-3" });

    // overdue detection (asOf well past the check-out)
    const overdue = await rec.records.overdue({ asOf: "2030-01-01T00:00:00.000Z", olderThanHours: 1 });
    expect(overdue.files.map((f) => f.mrn)).toEqual(["OM-2026-00001"]);

    // check back in → home, no longer outstanding
    await rec.records.checkIn({ fileId: file.fileId });
    expect((await rec.records.whereIs({ fileId: file.fileId })).out).toBe(false);
    expect((await rec.records.overdue({ asOf: "2030-01-01T00:00:00.000Z", olderThanHours: 1 })).files).toHaveLength(0);

    // archive → check-out is blocked
    await rec.records.archiveFile({ fileId: file.fileId, archiveLocation: "Archive/Room-2/Shelf-9" });
    await expectCode(() => rec.records.checkOut({ fileId: file.fileId, toLocation: "L3" }), "CONFLICT");

    // bilingual labels: MRN + Arabic name present; civil ID ABSENT (PHI minimisation)
    const label = await rec.records.fileSpineLabel({ mrn: "OM-2026-00001", nameEn: "Sara Al-Ali", nameAr: "سارة العلي", volume: 1 });
    expect(label.html).toContain("OM-2026-00001");
    expect(label.html).toContain("سارة العلي");
    expect(label.html).not.toContain(CIVIL_ID);
    expect(label.zpl).toContain("^BCN"); // Code 128 in ZPL
    const sheet = await rec.records.idLabelSheet({ mrn: "OM-2026-00001", nameEn: "Sara Al-Ali", nameAr: "سارة العلي", dob: "1990-05-01", count: 6 });
    expect((sheet.html.match(/class="idlabel"/g) ?? []).length).toBe(6);
    expect(sheet.html).not.toContain(CIVIL_ID);
    const thermal = await rec.records.thermalLabel({ mrn: "OM-2026-00001", nameEn: "Sara Al-Ali", nameAr: "سارة العلي" });
    expect(thermal.zpl).toContain("^XA");

    // the audit hash-chain is intact after all the mutations
    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("RBAC: a role without clinical:records.* is forbidden the records surface", async () => {
    const desk = appRouter.createCaller({ session: bookingOnly, patient: null, services });
    await expectCode(() => desk.records.assignMrn({ personId: "x" }), "FORBIDDEN");
    await expectCode(() => desk.records.pullList({ date: "2026-09-10" }), "FORBIDDEN");
    await expectCode(() => desk.records.fileSpineLabel({ mrn: "OM-2026-00001", nameEn: "A", nameAr: "أ" }), "FORBIDDEN");
  });
});
