import type { Id } from "@oxford/core";

// @oxford/records types (ADR-0065): MRN assignments, the physical file registry
// (files + volumes) and append-only file movements. The person is referenced by
// LOGICAL id only — no registry table access (module boundaries).

export type PatientFileId = Id<"PatientFile">;
export type FileMovementId = Id<"FileMovement">;

/** An MRN assignment on a person. Unique and never reused; `imported` marks a
 *  legacy (Cliniko-era) number brought in verbatim rather than allocated. */
export interface MrnAssignment {
  readonly mrn: string;
  readonly personId: string;
  readonly assignedAt: string;
  readonly imported: boolean;
}

/** A physical paper file (or a later volume of one). No destruction path exists
 *  — retention is an open legal item (ADR-0065); archive is the terminal state. */
export type FileStatus = "active" | "archived" | "missing";

export interface PatientFile {
  readonly id: PatientFileId;
  readonly personId: string;
  readonly mrn: string;
  /** Volume number, ≥ 1. A file grows into volumes 2, 3, … over time. */
  readonly volume: number;
  /** Home shelf/location in the records room. */
  readonly homeLocation: string;
  readonly status: FileStatus;
  /** Where the file is archived, once `status === "archived"`. */
  readonly archiveLocation: string | null;
  readonly createdAt: string;
}

/** Append-only movement of a physical file. `check_out` and `transfer` leave the
 *  file OUT (held at a location/by a staff member); `check_in` returns it. */
export type MovementKind = "check_out" | "check_in" | "transfer";

export interface FileMovement {
  readonly id: FileMovementId;
  readonly fileId: string;
  readonly kind: MovementKind;
  /** Destination — a location, or the location the holding staff member is at. */
  readonly toLocation: string;
  readonly toStaffId: string | null;
  readonly note: string | null;
  readonly at: string;
}

/** The derived current whereabouts of a file. */
export interface FileWhereabouts {
  readonly fileId: string;
  readonly mrn: string;
  readonly volume: number;
  readonly status: FileStatus;
  /** True when the file is checked out / away from its home location. */
  readonly out: boolean;
  readonly currentLocation: string;
  readonly holderStaffId: string | null;
}

/**
 * Read port over the scheduling module's published interface (ADR-0065). The
 * records module never imports scheduling directly (module boundaries) — the
 * app layer implements this over `SchedulingService`.
 */
export interface AppointmentsPort {
  appointmentsOn(dateIso: string): Promise<ReadonlyArray<{ patientId: string; start: string; practitionerId?: string }>>;
}
