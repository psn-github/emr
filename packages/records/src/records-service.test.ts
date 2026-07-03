import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { RecordsService, deriveState, type FileRef } from "./records-service.js";
import { InMemoryRecordsStore } from "./store.js";
import type { AppointmentsPort, PatientFile, FileMovement } from "./types.js";

const NOW = new Date("2026-07-03T08:00:00.000Z");

class FakeAppointments implements AppointmentsPort {
  rows: Array<{ patientId: string; start: string; practitionerId?: string }> = [];
  async appointmentsOn(_dateIso: string): Promise<ReadonlyArray<{ patientId: string; start: string; practitionerId?: string }>> {
    return this.rows;
  }
}

function build(now = NOW) {
  const clock = fixedClock(now);
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const appts = new FakeAppointments();
  const svc = new RecordsService(new InMemoryRecordsStore(), appts, audit, events, clock);
  return { svc, audit, events, appts };
}

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}

describe("MRN allocation", () => {
  it("allocates unique per-year sequential MRNs and is idempotent per person", async () => {
    const { svc, audit } = build();
    const a = await svc.assignMrn("rec-1", "person-A");
    const b = await svc.assignMrn("rec-1", "person-B");
    expect(a.ok && a.value).toEqual({ mrn: "OM-2026-00001", alreadyAssigned: false });
    expect(b.ok && b.value).toEqual({ mrn: "OM-2026-00002", alreadyAssigned: false });

    // re-assigning the same person returns the existing MRN, flagged
    const again = await svc.assignMrn("rec-1", "person-A");
    expect(again.ok && again.value).toEqual({ mrn: "OM-2026-00001", alreadyAssigned: true });

    expect(await svc.mrnFor("person-A")).toBe("OM-2026-00001");
    expect(await svc.mrnFor("person-Z")).toBe(null);
    expect(await svc.personFor("OM-2026-00002")).toBe("person-B");
    expect(await svc.personFor("OM-9999-99999")).toBe(null);

    // the allocation is audited
    expect((await audit.entries()).some((e) => e.payload.entityType === "MrnAssignment")).toBe(true);
  });

  it("imports legacy MRNs verbatim with uniqueness enforced", async () => {
    const { svc } = build();
    const ok = await svc.registerExistingMrn("rec-1", "person-L", "CLINIKO-4471");
    expect(ok.ok && ok.value.imported).toBe(true);
    expect(await svc.mrnFor("person-L")).toBe("CLINIKO-4471");

    // same person can't take another
    expect(detail(await svc.registerExistingMrn("rec-1", "person-L", "CLINIKO-9"))).toBe("records.mrn.person_taken");
    // MRN already in use by someone else
    expect(detail(await svc.registerExistingMrn("rec-1", "person-M", "CLINIKO-4471"))).toBe("records.mrn.taken");
    // blank/invalid rejected
    expect(detail(await svc.registerExistingMrn("rec-1", "person-N", " x "))).toBe("records.mrn.invalid");
  });
});

describe("Physical file registry", () => {
  it("opens a file (vol 1), adds volumes, and blocks a duplicate open", async () => {
    const { svc } = build();
    await svc.assignMrn("rec-1", "p1");
    const open = await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-12" });
    expect(open.ok && open.value.volume).toBe(1);
    expect(open.ok && open.value.status).toBe("active");

    // a second open is refused — add a volume instead
    expect(detail(await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-12" }))).toBe("records.file.exists");

    const v2 = await svc.addVolume("rec-1", { personId: "p1" }); // home defaults to vol-1's
    expect(v2.ok && v2.value.volume).toBe(2);
    expect(v2.ok && v2.value.homeLocation).toBe("Records/A-12");
    const v3 = await svc.addVolume("rec-1", { personId: "p1", homeLocation: "Records/B-3" });
    expect(v3.ok && v3.value.volume).toBe(3);
    expect(v3.ok && v3.value.homeLocation).toBe("Records/B-3");

    expect((await svc.files("p1")).map((f) => f.volume)).toEqual([1, 2, 3]);
  });

  it("guards opening/adding without an MRN or a file", async () => {
    const { svc } = build();
    expect(detail(await svc.openFile("rec-1", { personId: "ghost", homeLocation: "X" }))).toBe("records.mrn.not_found");
    expect(detail(await svc.addVolume("rec-1", { personId: "ghost" }))).toBe("records.file.not_found");
  });

  it("marks missing and archives (no destroy path)", async () => {
    const { svc } = build();
    await svc.assignMrn("rec-1", "p1");
    const file = await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-1" });
    if (!file.ok) throw new Error("setup");
    const ref: FileRef = { fileId: file.value.id };

    const missing = await svc.markMissing("rec-1", ref);
    expect(missing.ok && missing.value.status).toBe("missing");
    expect(detail(await svc.markMissing("rec-1", { fileId: "ghost" }))).toBe("records.file.not_found");

    const archived = await svc.archiveFile("rec-1", ref, "Archive/Room-2/Shelf-9");
    expect(archived.ok && archived.value.status).toBe("archived");
    expect(archived.ok && archived.value.archiveLocation).toBe("Archive/Room-2/Shelf-9");
  });
});

describe("Movements (check-out / check-in / transfer / whereIs)", () => {
  async function openOne() {
    const ctx = build();
    await ctx.svc.assignMrn("rec-1", "p1");
    const f = await ctx.svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-1" });
    if (!f.ok) throw new Error("setup");
    return { ...ctx, file: f.value, ref: { fileId: f.value.id } as FileRef };
  }

  it("check out → transfer → check in, with whereIs deriving each state", async () => {
    const { svc, file, ref } = await openOne();

    // at home before any movement
    const home = await svc.whereIs(ref);
    expect(home.ok && home.value).toMatchObject({ out: false, currentLocation: "Records/A-1", holderStaffId: null });

    const out = await svc.checkOut("rec-1", { ref, toLocation: "L3/Consult-2", toStaffId: "nurse-9", note: "clinic" });
    expect(out.ok).toBe(true);
    const where1 = await svc.whereIs(ref);
    expect(where1.ok && where1.value).toMatchObject({ out: true, currentLocation: "L3/Consult-2", holderStaffId: "nurse-9" });

    // can't check out again while out
    expect(detail(await svc.checkOut("rec-1", { ref, toLocation: "L1" }))).toBe("records.file.already_out");

    // transfer moves holder→holder directly
    const moved = await svc.transfer("rec-1", { ref, toLocation: "L1/Theatre-1", toStaffId: "porter-3" });
    expect(moved.ok).toBe(true);
    const where2 = await svc.whereIs(ref);
    expect(where2.ok && where2.value.currentLocation).toBe("L1/Theatre-1");

    // check in returns it home by default
    const back = await svc.checkIn("rec-1", { ref });
    expect(back.ok).toBe(true);
    const where3 = await svc.whereIs(ref);
    expect(where3.ok && where3.value).toMatchObject({ out: false, currentLocation: "Records/A-1" });

    // movement trail is append-only (4 movements recorded)
    expect((await svc.movements(file.id)).map((m) => m.kind)).toEqual(["check_out", "transfer", "check_in"]);
  });

  it("check-in to a named location instead of home", async () => {
    const { svc, ref } = await openOne();
    await svc.checkOut("rec-1", { ref, toLocation: "L2/Ward" });
    const back = await svc.checkIn("rec-1", { ref, toLocation: "Records/Overflow-1", note: "temp shelf" });
    expect(back.ok).toBe(true);
    const where = await svc.whereIs(ref);
    expect(where.ok && where.value.currentLocation).toBe("Records/Overflow-1");
  });

  it("rejects illegal movements and resolves files by MRN+volume", async () => {
    const { svc } = await openOne();
    // resolve by mrn+volume (the barcode-scan path)
    const byScan: FileRef = { mrn: "OM-2026-00001", volume: 1 };
    expect((await svc.whereIs(byScan)).ok).toBe(true);

    // check-in / transfer when not out
    expect(detail(await svc.checkIn("rec-1", { ref: byScan }))).toBe("records.file.not_out");
    expect(detail(await svc.transfer("rec-1", { ref: byScan, toLocation: "L1" }))).toBe("records.file.not_out");

    // unknown file
    expect(detail(await svc.checkOut("rec-1", { ref: { fileId: "ghost" }, toLocation: "L1" }))).toBe("records.file.not_found");
    expect(detail(await svc.whereIs({ mrn: "NOPE", volume: 9 }))).toBe("records.file.not_found");
  });

  it("blocks checking out an archived or missing file", async () => {
    const { svc, ref } = await openOne();
    await svc.archiveFile("rec-1", ref, "Archive/Z");
    expect(detail(await svc.checkOut("rec-1", { ref, toLocation: "L3" }))).toBe("records.file.not_active");

    const other = await openOne();
    await other.svc.markMissing("rec-1", other.ref);
    expect(detail(await other.svc.checkOut("rec-1", { ref: other.ref, toLocation: "L3" }))).toBe("records.file.not_active");
  });
});

describe("outstanding / overdue detection", () => {
  it("lists files out longer than the threshold, excluding returned + fresh ones", async () => {
    const early = build(new Date("2026-07-03T06:00:00.000Z"));
    const { svc } = early;
    await svc.assignMrn("rec-1", "p1");
    await svc.assignMrn("rec-1", "p2");
    await svc.assignMrn("rec-1", "p3");
    const f1 = await svc.openFile("rec-1", { personId: "p1", homeLocation: "H1" });
    const f2 = await svc.openFile("rec-1", { personId: "p2", homeLocation: "H2" });
    const f3 = await svc.openFile("rec-1", { personId: "p3", homeLocation: "H3" });
    if (!f1.ok || !f2.ok || !f3.ok) throw new Error("setup");

    // all checked out at 06:00 (the fixed clock)
    await svc.checkOut("rec-1", { ref: { fileId: f1.value.id }, toLocation: "L3" });
    await svc.checkOut("rec-1", { ref: { fileId: f2.value.id }, toLocation: "L1" });
    await svc.checkOut("rec-1", { ref: { fileId: f3.value.id }, toLocation: "L2" });
    // f2 is returned
    await svc.checkIn("rec-1", { ref: { fileId: f2.value.id } });

    // as of 09:00, threshold 2h → f1 & f3 (out 3h) are overdue, f2 excluded (home)
    const overdue = await svc.outstanding(new Date("2026-07-03T09:00:00.000Z"), 2);
    expect(overdue.map((r) => r.mrn).sort()).toEqual(["OM-2026-00001", "OM-2026-00003"]);
    expect(overdue[0]!.hoursOut).toBeCloseTo(3, 5);

    // threshold 4h → none yet (only 3h out)
    expect(await svc.outstanding(new Date("2026-07-03T09:00:00.000Z"), 4)).toHaveLength(0);
  });
});

describe("pull list (from scheduling via the port)", () => {
  it("returns one active-file row per booked patient with current location + alreadyOut", async () => {
    const { svc, appts } = build();
    await svc.assignMrn("rec-1", "p1");
    await svc.assignMrn("rec-1", "p2");
    await svc.assignMrn("rec-1", "p3");
    const f1 = await svc.openFile("rec-1", { personId: "p1", homeLocation: "Records/A-1" });
    await svc.addVolume("rec-1", { personId: "p1" }); // p1 has vols 1 + 2
    await svc.openFile("rec-1", { personId: "p2", homeLocation: "Records/B-2" });
    const f3 = await svc.openFile("rec-1", { personId: "p3", homeLocation: "Records/C-3" });
    if (!f1.ok || !f3.ok) throw new Error("setup");

    // p3 archived → excluded; p1 vol1 already checked out
    await svc.archiveFile("rec-1", { fileId: f3.value.id }, "Archive/Z");
    await svc.checkOut("rec-1", { ref: { fileId: f1.value.id }, toLocation: "L3/Consult-1", toStaffId: "nurse-1" });

    appts.rows = [
      { patientId: "p1", start: "2026-07-04T09:00:00.000Z", practitionerId: "doc-1" },
      { patientId: "p1", start: "2026-07-04T10:00:00.000Z" }, // duplicate patient → dedup by file
      { patientId: "p2", start: "2026-07-04T09:30:00.000Z" },
      { patientId: "p3", start: "2026-07-04T11:00:00.000Z" }, // archived — no row
      { patientId: "p9", start: "2026-07-04T12:00:00.000Z" }, // no file — skipped
    ];

    const list = await svc.pullList("2026-07-04");
    expect(list.map((r) => `${r.mrn}#${r.volume}`)).toEqual(["OM-2026-00001#1", "OM-2026-00001#2", "OM-2026-00002#1"]);
    const p1v1 = list.find((r) => r.volume === 1 && r.mrn === "OM-2026-00001")!;
    expect(p1v1).toMatchObject({ alreadyOut: true, currentLocation: "L3/Consult-1" });
    const p2 = list.find((r) => r.mrn === "OM-2026-00002")!;
    expect(p2).toMatchObject({ alreadyOut: false, currentLocation: "Records/B-2" });
  });
});

describe("deriveState (pure)", () => {
  const file: PatientFile = { id: "f1" as PatientFile["id"], personId: "p", mrn: "M", volume: 1, homeLocation: "HOME", status: "active", archiveLocation: null, createdAt: NOW.toISOString() };
  it("no movement → at home", () => {
    expect(deriveState(file, null)).toEqual({ out: false, location: "HOME", holderStaffId: null });
  });
  const mId = "m" as FileMovement["id"];
  it("check_in → not out, at the returned location", () => {
    expect(deriveState(file, { id: mId, fileId: "f1", kind: "check_in", toLocation: "SHELF-9", toStaffId: null, note: null, at: NOW.toISOString() })).toEqual({ out: false, location: "SHELF-9", holderStaffId: null });
  });
  it("check_out → out, held by staff", () => {
    expect(deriveState(file, { id: mId, fileId: "f1", kind: "check_out", toLocation: "L3", toStaffId: "n1", note: null, at: NOW.toISOString() })).toEqual({ out: true, location: "L3", holderStaffId: "n1" });
  });
});
