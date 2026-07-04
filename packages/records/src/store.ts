import type { MrnAssignment, PatientFile, PatientFileId, FileMovement } from "./types.js";

/** Persistence seam for @oxford/records. The MRN counter is per-year and
 *  monotonic (never reused); files + movements are append-only. */
export interface RecordsStore {
  /** Atomically allocate the next per-year MRN sequence (1-based, monotonic). */
  nextMrnSeq(year: number): Promise<number>;
  saveAssignment(a: MrnAssignment): Promise<void>;
  getAssignmentByPerson(personId: string): Promise<MrnAssignment | null>;
  getAssignmentByMrn(mrn: string): Promise<MrnAssignment | null>;

  saveFile(f: PatientFile): Promise<void>;
  getFile(id: PatientFileId): Promise<PatientFile | null>;
  filesForPerson(personId: string): Promise<readonly PatientFile[]>;
  fileByMrnVolume(mrn: string, volume: number): Promise<PatientFile | null>;
  allFiles(): Promise<readonly PatientFile[]>;

  saveMovement(m: FileMovement): Promise<void>;
  movementsForFile(fileId: string): Promise<readonly FileMovement[]>;
  latestMovementForFile(fileId: string): Promise<FileMovement | null>;
  /** The latest movement for every file that has one (for outstanding/overdue). */
  latestMovements(): Promise<readonly FileMovement[]>;
}

export class InMemoryRecordsStore implements RecordsStore {
  private readonly seqByYear = new Map<number, number>();
  private readonly assignments = new Map<string, MrnAssignment>(); // by mrn
  private readonly byPerson = new Map<string, string>(); // personId -> mrn
  private readonly files = new Map<string, PatientFile>();
  private readonly movements: FileMovement[] = [];

  async nextMrnSeq(year: number): Promise<number> {
    const next = (this.seqByYear.get(year) ?? 0) + 1;
    this.seqByYear.set(year, next);
    return next;
  }
  async saveAssignment(a: MrnAssignment): Promise<void> {
    this.assignments.set(a.mrn, a);
    this.byPerson.set(a.personId, a.mrn);
  }
  async getAssignmentByPerson(personId: string): Promise<MrnAssignment | null> {
    const mrn = this.byPerson.get(personId);
    return mrn === undefined ? null : this.assignments.get(mrn) ?? null;
  }
  async getAssignmentByMrn(mrn: string): Promise<MrnAssignment | null> {
    return this.assignments.get(mrn) ?? null;
  }

  async saveFile(f: PatientFile): Promise<void> {
    this.files.set(f.id, f);
  }
  async getFile(id: PatientFileId): Promise<PatientFile | null> {
    return this.files.get(id) ?? null;
  }
  async filesForPerson(personId: string): Promise<readonly PatientFile[]> {
    return [...this.files.values()].filter((f) => f.personId === personId).sort((a, b) => a.volume - b.volume);
  }
  async fileByMrnVolume(mrn: string, volume: number): Promise<PatientFile | null> {
    return [...this.files.values()].find((f) => f.mrn === mrn && f.volume === volume) ?? null;
  }
  async allFiles(): Promise<readonly PatientFile[]> {
    return [...this.files.values()];
  }

  async saveMovement(m: FileMovement): Promise<void> {
    this.movements.push(m);
  }
  async movementsForFile(fileId: string): Promise<readonly FileMovement[]> {
    return this.movements.filter((m) => m.fileId === fileId).sort(byAt);
  }
  async latestMovementForFile(fileId: string): Promise<FileMovement | null> {
    const forFile = this.movements.filter((m) => m.fileId === fileId).sort(byAt);
    return forFile.length > 0 ? forFile[forFile.length - 1]! : null;
  }
  async latestMovements(): Promise<readonly FileMovement[]> {
    const latest = new Map<string, FileMovement>();
    for (const m of [...this.movements].sort(byAt)) {
      latest.set(m.fileId, m); // last write for a file wins (sorted ascending)
    }
    return [...latest.values()];
  }
}

function byAt(a: FileMovement, b: FileMovement): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}
