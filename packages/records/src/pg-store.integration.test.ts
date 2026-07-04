// Integration: MRN counter, file registry and movements persist to Postgres and
// round-trip exactly. Runs where DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { RecordsService, type FileRef } from "./records-service.js";
import { PgRecordsStore } from "./pg-store.js";
import type { AppointmentsPort } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_records.sql", import.meta.url), "utf8");

class FixedAppointments implements AppointmentsPort {
  constructor(private readonly rows: Array<{ patientId: string; start: string; practitionerId?: string }>) {}
  async appointmentsOn(): Promise<ReadonlyArray<{ patientId: string; start: string; practitionerId?: string }>> {
    return this.rows;
  }
}

describe.skipIf(!DATABASE_URL)("PgRecordsStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-07-03T06:00:00.000Z"));

  function svcWith(rows: Array<{ patientId: string; start: string; practitionerId?: string }> = []) {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    return new RecordsService(new PgRecordsStore(pool), new FixedAppointments(rows), audit, events, clock);
  }

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE records.mrn_counter, records.mrn_assignment, records.patient_file, records.file_movement");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("allocates monotonic MRNs and persists a file + movement lifecycle", async () => {
    const svc = svcWith();
    const a = await svc.assignMrn("rec-1", "p1");
    const b = await svc.assignMrn("rec-1", "p2");
    expect(a.ok && a.value.mrn).toBe("OM-2026-00001");
    expect(b.ok && b.value.mrn).toBe("OM-2026-00002");
    // idempotent per person
    const again = await svc.assignMrn("rec-1", "p1");
    expect(again.ok && again.value).toMatchObject({ mrn: "OM-2026-00001", alreadyAssigned: true });

    const file = await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-1" });
    if (!file.ok) throw new Error("setup");
    const ref: FileRef = { fileId: file.value.id };

    await svc.checkOut("rec-1", { ref, toLocation: "L3/Consult-1", toStaffId: "nurse-1" });
    await svc.transfer("rec-1", { ref, toLocation: "L1/Theatre-1", toStaffId: "porter-1" });
    const where = await svc.whereIs(ref);
    expect(where.ok && where.value).toMatchObject({ out: true, currentLocation: "L1/Theatre-1", holderStaffId: "porter-1" });

    // overdue as of 09:00 (out since 06:00), threshold 2h
    const overdue = await svc.outstanding(new Date("2026-07-03T09:00:00.000Z"), 2);
    expect(overdue.map((r) => r.mrn)).toEqual(["OM-2026-00001"]);

    await svc.checkIn("rec-1", { ref });
    const back = await svc.whereIs(ref);
    expect(back.ok && back.value).toMatchObject({ out: false, currentLocation: "Records/A-1" });

    // raw persistence: 3 append-only movements
    const raw = await pool.query<{ n: string }>("SELECT count(*) AS n FROM records.file_movement WHERE file_id = $1", [file.value.id]);
    expect(Number(raw.rows[0]!.n)).toBe(3);
  });

  it("archive blocks check-out and the pull list skips it", async () => {
    const svc = svcWith([{ patientId: "p1", start: "2026-07-04T09:00:00.000Z" }]);
    await svc.assignMrn("rec-1", "p1");
    const file = await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-1" });
    if (!file.ok) throw new Error("setup");
    await svc.archiveFile("rec-1", { fileId: file.value.id }, "Archive/Z");
    const blocked = await svc.checkOut("rec-1", { ref: { fileId: file.value.id }, toLocation: "L3" });
    expect(blocked.ok).toBe(false);
    expect(await svc.pullList("2026-07-04")).toHaveLength(0); // archived → not pulled
  });

  it("imports a legacy MRN and enforces uniqueness at the DB", async () => {
    const svc = svcWith();
    const imported = await svc.registerExistingMrn("rec-1", "pL", "CLINIKO-4471");
    expect(imported.ok && imported.value.imported).toBe(true);
    const dup = await svc.registerExistingMrn("rec-1", "pM", "CLINIKO-4471");
    expect(dup.ok).toBe(false);
    expect(await svc.personFor("CLINIKO-4471")).toBe("pL");
  });
});
