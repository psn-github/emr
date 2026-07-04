import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { MrnAssignment, PatientFile, PatientFileId, FileMovement } from "./types.js";
import type { RecordsStore } from "./store.js";

/** Postgres-backed RecordsStore. */
export class PgRecordsStore implements RecordsStore {
  constructor(private readonly pool: Pool) {}

  async nextMrnSeq(year: number): Promise<number> {
    // Atomic allocate-and-return: first row for a year yields 1; each subsequent
    // call increments and returns the new value. Monotonic — never reused.
    const r = await this.pool.query<{ next_seq: number }>(
      `INSERT INTO records.mrn_counter AS c (year, next_seq) VALUES ($1, 1)
       ON CONFLICT (year) DO UPDATE SET next_seq = c.next_seq + 1
       RETURNING next_seq`,
      [year],
    );
    return Number(r.rows[0]!.next_seq);
  }

  async saveAssignment(a: MrnAssignment): Promise<void> {
    await this.pool.query(
      `INSERT INTO records.mrn_assignment (mrn, person_id, assigned_at, imported) VALUES ($1,$2,$3,$4)
       ON CONFLICT (mrn) DO NOTHING`,
      [a.mrn, a.personId, a.assignedAt, a.imported],
    );
  }
  async getAssignmentByPerson(personId: string): Promise<MrnAssignment | null> {
    const r = await this.pool.query<AssignmentRow>("SELECT * FROM records.mrn_assignment WHERE person_id = $1", [personId]);
    return r.rows[0] ? assignmentFrom(r.rows[0]) : null;
  }
  async getAssignmentByMrn(mrn: string): Promise<MrnAssignment | null> {
    const r = await this.pool.query<AssignmentRow>("SELECT * FROM records.mrn_assignment WHERE mrn = $1", [mrn]);
    return r.rows[0] ? assignmentFrom(r.rows[0]) : null;
  }

  async saveFile(f: PatientFile): Promise<void> {
    await this.pool.query(
      `INSERT INTO records.patient_file (id, person_id, mrn, volume, home_location, status, archive_location, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, archive_location=EXCLUDED.archive_location, home_location=EXCLUDED.home_location`,
      [f.id, f.personId, f.mrn, f.volume, f.homeLocation, f.status, f.archiveLocation, f.createdAt],
    );
  }
  async getFile(id: PatientFileId): Promise<PatientFile | null> {
    const r = await this.pool.query<FileRow>("SELECT * FROM records.patient_file WHERE id = $1", [id]);
    return r.rows[0] ? fileFrom(r.rows[0]) : null;
  }
  async filesForPerson(personId: string): Promise<readonly PatientFile[]> {
    const r = await this.pool.query<FileRow>("SELECT * FROM records.patient_file WHERE person_id = $1 ORDER BY volume", [personId]);
    return r.rows.map(fileFrom);
  }
  async fileByMrnVolume(mrn: string, volume: number): Promise<PatientFile | null> {
    const r = await this.pool.query<FileRow>("SELECT * FROM records.patient_file WHERE mrn = $1 AND volume = $2", [mrn, volume]);
    return r.rows[0] ? fileFrom(r.rows[0]) : null;
  }
  async allFiles(): Promise<readonly PatientFile[]> {
    const r = await this.pool.query<FileRow>("SELECT * FROM records.patient_file ORDER BY mrn, volume");
    return r.rows.map(fileFrom);
  }

  async saveMovement(m: FileMovement): Promise<void> {
    await this.pool.query(
      `INSERT INTO records.file_movement (id, file_id, kind, to_location, to_staff_id, note, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.fileId, m.kind, m.toLocation, m.toStaffId, m.note, m.at],
    );
  }
  async movementsForFile(fileId: string): Promise<readonly FileMovement[]> {
    const r = await this.pool.query<MovementRow>("SELECT * FROM records.file_movement WHERE file_id = $1 ORDER BY seq", [fileId]);
    return r.rows.map(movementFrom);
  }
  async latestMovementForFile(fileId: string): Promise<FileMovement | null> {
    const r = await this.pool.query<MovementRow>("SELECT * FROM records.file_movement WHERE file_id = $1 ORDER BY seq DESC LIMIT 1", [fileId]);
    return r.rows[0] ? movementFrom(r.rows[0]) : null;
  }
  async latestMovements(): Promise<readonly FileMovement[]> {
    const r = await this.pool.query<MovementRow>(
      `SELECT DISTINCT ON (file_id) * FROM records.file_movement ORDER BY file_id, seq DESC`,
    );
    return r.rows.map(movementFrom);
  }
}

interface AssignmentRow { mrn: string; person_id: string; assigned_at: Date; imported: boolean }
interface FileRow { id: string; person_id: string; mrn: string; volume: number; home_location: string; status: string; archive_location: string | null; created_at: Date }
interface MovementRow { id: string; file_id: string; kind: string; to_location: string; to_staff_id: string | null; note: string | null; at: Date }

const iso = (d: Date): string => new Date(d).toISOString();
function assignmentFrom(r: AssignmentRow): MrnAssignment {
  return { mrn: r.mrn, personId: r.person_id, assignedAt: iso(r.assigned_at), imported: r.imported };
}
function fileFrom(r: FileRow): PatientFile {
  return { id: asId<"PatientFile">(r.id), personId: r.person_id, mrn: r.mrn, volume: Number(r.volume), homeLocation: r.home_location, status: r.status as PatientFile["status"], archiveLocation: r.archive_location, createdAt: iso(r.created_at) };
}
function movementFrom(r: MovementRow): FileMovement {
  return { id: asId<"FileMovement">(r.id), fileId: r.file_id, kind: r.kind as FileMovement["kind"], toLocation: r.to_location, toStaffId: r.to_staff_id, note: r.note, at: iso(r.at) };
}
