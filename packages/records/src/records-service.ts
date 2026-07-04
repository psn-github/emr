import type { Result, AppError, Clock } from "@oxford/core";
import { ok, err, newId, asId, notFound, conflict, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  MrnAssignment,
  PatientFile,
  FileMovement,
  FileWhereabouts,
  AppointmentsPort,
} from "./types.js";
import type { RecordsStore } from "./store.js";
import { type MrnFormat, DEFAULT_MRN_FORMAT, formatMrn, isImportableMrn } from "./mrn.js";

export interface AssignMrnResult {
  readonly mrn: string;
  /** True when the person already held an MRN — the existing one is returned. */
  readonly alreadyAssigned: boolean;
}

/** Identify a file either by its id, or by MRN + volume (barcode scan path). */
export type FileRef = { readonly fileId: string } | { readonly mrn: string; readonly volume: number };

export interface OpenFileInput {
  readonly personId: string;
  readonly homeLocation: string;
}
export interface AddVolumeInput {
  readonly personId: string;
  readonly homeLocation?: string;
}
export interface CheckOutInput {
  readonly ref: FileRef;
  readonly toLocation: string;
  readonly toStaffId?: string;
  readonly note?: string;
}
export interface CheckInInput {
  readonly ref: FileRef;
  /** Where the file returns to — defaults to its home location. */
  readonly toLocation?: string;
  readonly note?: string;
}
export interface TransferInput {
  readonly ref: FileRef;
  readonly toLocation: string;
  readonly toStaffId?: string;
  readonly note?: string;
}

export interface OutstandingRow {
  readonly fileId: string;
  readonly mrn: string;
  readonly personId: string;
  readonly location: string;
  readonly holderStaffId: string | null;
  readonly since: string;
  readonly hoursOut: number;
}

export interface PullListRow {
  readonly mrn: string;
  readonly personId: string;
  readonly volume: number;
  readonly currentLocation: string;
  readonly alreadyOut: boolean;
}

interface DerivedState {
  readonly out: boolean;
  readonly location: string;
  readonly holderStaffId: string | null;
}

/**
 * @oxford/records (ADR-0065): the paper file as a first-class, audited entity.
 * MRN allocation (config format, DB-sequence-backed, unique/never-reused, legacy
 * import), the physical file registry (+ volumes; archive but never destroy),
 * append-only barcode-keyed movements (check-out / check-in / transfer, overdue
 * detection), and the day's clinic pull list from scheduling via a port. Labels
 * are pure renderers (code128.ts / labels.ts). Every mutation is audited and
 * emits a domain event.
 */
export class RecordsService {
  private readonly format: MrnFormat;

  constructor(
    private readonly store: RecordsStore,
    private readonly appointments: AppointmentsPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    format: MrnFormat = DEFAULT_MRN_FORMAT,
  ) {
    this.format = format;
  }

  // ── MRN allocation ─────────────────────────────────────────────────────────

  /** Allocate an MRN for a person. Idempotent: a person who already holds one
   *  gets it back, flagged `alreadyAssigned` (MRNs are unique + never reused). */
  async assignMrn(actorId: string, personId: string): Promise<Result<AssignMrnResult, AppError>> {
    const existing = await this.store.getAssignmentByPerson(personId);
    if (existing !== null) return ok({ mrn: existing.mrn, alreadyAssigned: true });
    const year = this.clock.now().getUTCFullYear();
    const seq = await this.store.nextMrnSeq(year);
    const mrn = formatMrn(this.format, year, seq);
    const assignment: MrnAssignment = { mrn, personId, assignedAt: this.now(), imported: false };
    await this.store.saveAssignment(assignment);
    await this.audit.record({ actorId, entityType: "MrnAssignment", entityId: mrn, action: "CREATE", after: { personId, mrn, imported: false } });
    await this.events.emit({ type: "MrnAssigned", aggregateType: "MrnAssignment", aggregateId: mrn, data: { personId } });
    return ok({ mrn, alreadyAssigned: false });
  }

  /** Register a legacy (Cliniko-era) file number verbatim. Uniqueness enforced:
   *  the person must not already hold an MRN, and the MRN must be free. */
  async registerExistingMrn(actorId: string, personId: string, mrn: string): Promise<Result<MrnAssignment, AppError>> {
    if (!isImportableMrn(mrn)) return err(validationError("mrn must be non-empty and untrimmed-blank-free", "records.mrn.invalid"));
    const byPerson = await this.store.getAssignmentByPerson(personId);
    if (byPerson !== null) return err(conflict("person already holds an MRN", "records.mrn.person_taken"));
    const byMrn = await this.store.getAssignmentByMrn(mrn);
    if (byMrn !== null) return err(conflict("MRN already in use", "records.mrn.taken"));
    const assignment: MrnAssignment = { mrn, personId, assignedAt: this.now(), imported: true };
    await this.store.saveAssignment(assignment);
    await this.audit.record({ actorId, entityType: "MrnAssignment", entityId: mrn, action: "CREATE", after: { personId, mrn, imported: true } });
    await this.events.emit({ type: "MrnImported", aggregateType: "MrnAssignment", aggregateId: mrn, data: { personId } });
    return ok(assignment);
  }

  async mrnFor(personId: string): Promise<string | null> {
    return (await this.store.getAssignmentByPerson(personId))?.mrn ?? null;
  }
  async personFor(mrn: string): Promise<string | null> {
    return (await this.store.getAssignmentByMrn(mrn))?.personId ?? null;
  }

  // ── Physical file registry ─────────────────────────────────────────────────

  /** Open the physical file (volume 1) for a person who holds an MRN. */
  async openFile(actorId: string, input: OpenFileInput): Promise<Result<PatientFile, AppError>> {
    const mrn = await this.mrnFor(input.personId);
    if (mrn === null) return err(notFound("person has no MRN — assign one first", "records.mrn.not_found"));
    const existing = await this.store.filesForPerson(input.personId);
    if (existing.length > 0) return err(conflict("a file already exists — add a volume instead", "records.file.exists"));
    const file = this.newFile(input.personId, mrn, 1, input.homeLocation);
    await this.store.saveFile(file);
    await this.recordFileAudit(actorId, file, "CREATE", { volume: 1, homeLocation: input.homeLocation });
    await this.events.emit({ type: "FileOpened", aggregateType: "PatientFile", aggregateId: file.id, data: { mrn, volume: 1 } });
    return ok(file);
  }

  /** Add the next volume to an existing file. */
  async addVolume(actorId: string, input: AddVolumeInput): Promise<Result<PatientFile, AppError>> {
    const files = await this.store.filesForPerson(input.personId);
    if (files.length === 0) return err(notFound("no file to add a volume to — open one first", "records.file.not_found"));
    const maxVolume = Math.max(...files.map((f) => f.volume));
    const home = input.homeLocation ?? files[0]!.homeLocation;
    const file = this.newFile(input.personId, files[0]!.mrn, maxVolume + 1, home);
    await this.store.saveFile(file);
    await this.recordFileAudit(actorId, file, "CREATE", { volume: file.volume, homeLocation: home });
    await this.events.emit({ type: "FileVolumeAdded", aggregateType: "PatientFile", aggregateId: file.id, data: { mrn: file.mrn, volume: file.volume } });
    return ok(file);
  }

  /** Mark a file missing (audited). No destruction path exists (ADR-0065). */
  async markMissing(actorId: string, ref: FileRef): Promise<Result<PatientFile, AppError>> {
    const resolved = await this.resolve(ref);
    if (!resolved.ok) return err(resolved.error);
    const before = resolved.value.status;
    const updated: PatientFile = { ...resolved.value, status: "missing" };
    await this.store.saveFile(updated);
    await this.recordFileAudit(actorId, updated, "UPDATE", { status: "missing" }, { status: before });
    await this.events.emit({ type: "FileMarkedMissing", aggregateType: "PatientFile", aggregateId: updated.id, data: { mrn: updated.mrn } });
    return ok(updated);
  }

  /** Archive a file to a named archive location (terminal state — no destroy). */
  async archiveFile(actorId: string, ref: FileRef, archiveLocation: string): Promise<Result<PatientFile, AppError>> {
    const resolved = await this.resolve(ref);
    if (!resolved.ok) return err(resolved.error);
    const before = resolved.value.status;
    const updated: PatientFile = { ...resolved.value, status: "archived", archiveLocation };
    await this.store.saveFile(updated);
    await this.recordFileAudit(actorId, updated, "UPDATE", { status: "archived", archiveLocation }, { status: before });
    await this.events.emit({ type: "FileArchived", aggregateType: "PatientFile", aggregateId: updated.id, data: { mrn: updated.mrn, archiveLocation } });
    return ok(updated);
  }

  // ── Movements (append-only, barcode-keyed) ─────────────────────────────────

  /** Check a file out to a floor/room/staff member. Rejects a missing/archived
   *  file, or one already checked out (check it in or transfer it instead). */
  async checkOut(actorId: string, input: CheckOutInput): Promise<Result<FileMovement, AppError>> {
    const resolved = await this.resolve(input.ref);
    if (!resolved.ok) return err(resolved.error);
    const file = resolved.value;
    if (file.status !== "active") return err(conflict("only an active file can be checked out", "records.file.not_active"));
    const state = await this.state(file);
    if (state.out) return err(conflict("file is already checked out — check it in or transfer it", "records.file.already_out"));
    return this.appendMovement(actorId, file, "check_out", input.toLocation, input.toStaffId, input.note, "FileCheckedOut");
  }

  /** Check a file back in (to its home location by default, or a named location). */
  async checkIn(actorId: string, input: CheckInInput): Promise<Result<FileMovement, AppError>> {
    const resolved = await this.resolve(input.ref);
    if (!resolved.ok) return err(resolved.error);
    const file = resolved.value;
    const state = await this.state(file);
    if (!state.out) return err(conflict("file is not checked out", "records.file.not_out"));
    const toLocation = input.toLocation ?? file.homeLocation;
    return this.appendMovement(actorId, file, "check_in", toLocation, undefined, input.note, "FileCheckedIn");
  }

  /** Move a checked-out file directly from one holder/floor to the next. */
  async transfer(actorId: string, input: TransferInput): Promise<Result<FileMovement, AppError>> {
    const resolved = await this.resolve(input.ref);
    if (!resolved.ok) return err(resolved.error);
    const file = resolved.value;
    const state = await this.state(file);
    if (!state.out) return err(conflict("file must be checked out before it can be transferred", "records.file.not_out"));
    return this.appendMovement(actorId, file, "transfer", input.toLocation, input.toStaffId, input.note, "FileTransferred");
  }

  /** Where is this file now — derived from its latest movement. */
  async whereIs(ref: FileRef): Promise<Result<FileWhereabouts, AppError>> {
    const resolved = await this.resolve(ref);
    if (!resolved.ok) return err(resolved.error);
    const file = resolved.value;
    const state = await this.state(file);
    return ok({ fileId: file.id, mrn: file.mrn, volume: file.volume, status: file.status, out: state.out, currentLocation: state.location, holderStaffId: state.holderStaffId });
  }

  /** Files currently OUT whose last movement is older than `olderThanHours`
   *  (the overdue / follow-up list). */
  async outstanding(asOf: Date, olderThanHours: number): Promise<readonly OutstandingRow[]> {
    const [files, latest] = await Promise.all([this.store.allFiles(), this.store.latestMovements()]);
    const byId = new Map<string, PatientFile>(files.map((f) => [f.id, f]));
    const cutoff = asOf.getTime() - olderThanHours * 3_600_000;
    const rows: OutstandingRow[] = [];
    for (const m of latest) {
      if (m.kind === "check_in") continue; // back home — not outstanding
      const at = Date.parse(m.at);
      if (at > cutoff) continue;
      const file = byId.get(m.fileId)!; // every movement belongs to a stored file
      rows.push({
        fileId: m.fileId,
        mrn: file.mrn,
        personId: file.personId,
        location: m.toLocation,
        holderStaffId: m.toStaffId,
        since: m.at,
        hoursOut: (asOf.getTime() - at) / 3_600_000,
      });
    }
    return rows.sort((a, b) => b.hoursOut - a.hoursOut);
  }

  // ── Pull list (from scheduling via the port) ───────────────────────────────

  /** The files to pull for a day's booked patients — one row per active file. */
  async pullList(dateIso: string): Promise<readonly PullListRow[]> {
    const appts = await this.appointments.appointmentsOn(dateIso);
    const patientIds = [...new Set(appts.map((a) => a.patientId))];
    const seen = new Set<string>();
    const rows: PullListRow[] = [];
    for (const personId of patientIds) {
      const files = await this.store.filesForPerson(personId);
      for (const file of files) {
        if (file.status !== "active") continue; // archived/missing can't be pulled
        if (seen.has(file.id)) continue;
        seen.add(file.id);
        const state = await this.state(file);
        rows.push({ mrn: file.mrn, personId, volume: file.volume, currentLocation: state.location, alreadyOut: state.out });
      }
    }
    return rows.sort((a, b) => (a.mrn === b.mrn ? a.volume - b.volume : a.mrn < b.mrn ? -1 : 1));
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  files(personId: string): Promise<readonly PatientFile[]> {
    return this.store.filesForPerson(personId);
  }
  movements(fileId: string): Promise<readonly FileMovement[]> {
    return this.store.movementsForFile(fileId);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private newFile(personId: string, mrn: string, volume: number, homeLocation: string): PatientFile {
    return { id: newId<"PatientFile">(), personId, mrn, volume, homeLocation, status: "active", archiveLocation: null, createdAt: this.now() };
  }

  private async appendMovement(
    actorId: string,
    file: PatientFile,
    kind: FileMovement["kind"],
    toLocation: string,
    toStaffId: string | undefined,
    note: string | undefined,
    eventType: string,
  ): Promise<Result<FileMovement, AppError>> {
    const movement: FileMovement = {
      id: newId<"FileMovement">(),
      fileId: file.id,
      kind,
      toLocation,
      toStaffId: toStaffId ?? null,
      note: note ?? null,
      at: this.now(),
    };
    await this.store.saveMovement(movement);
    await this.audit.record({ actorId, entityType: "FileMovement", entityId: movement.id, action: "CREATE", after: { fileId: file.id, mrn: file.mrn, kind, toLocation, toStaffId: movement.toStaffId } });
    await this.events.emit({ type: eventType, aggregateType: "PatientFile", aggregateId: file.id, data: { mrn: file.mrn, kind, toLocation } });
    return ok(movement);
  }

  private async resolve(ref: FileRef): Promise<Result<PatientFile, AppError>> {
    const file = "fileId" in ref
      ? await this.store.getFile(asId<"PatientFile">(ref.fileId))
      : await this.store.fileByMrnVolume(ref.mrn, ref.volume);
    if (file === null) return err(notFound("file not found", "records.file.not_found"));
    return ok(file);
  }

  private async state(file: PatientFile): Promise<DerivedState> {
    const latest = await this.store.latestMovementForFile(file.id);
    return deriveState(file, latest);
  }

  private now(): string {
    return this.clock.now().toISOString();
  }

  private async recordFileAudit(
    actorId: string,
    file: PatientFile,
    action: "CREATE" | "UPDATE",
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({ actorId, entityType: "PatientFile", entityId: file.id, action, after: { mrn: file.mrn, ...after }, ...(before ? { before } : {}) });
  }
}

/** Pure derivation of a file's whereabouts from its latest movement. */
export function deriveState(file: PatientFile, latest: FileMovement | null): DerivedState {
  if (latest === null || latest.kind === "check_in") {
    return { out: false, location: latest?.toLocation ?? file.homeLocation, holderStaffId: null };
  }
  return { out: true, location: latest.toLocation, holderStaffId: latest.toStaffId };
}
