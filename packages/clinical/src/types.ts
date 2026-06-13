import type { Id } from "@oxford/core";

// Clinical EMR core (docs/01 §E2). All PHI; access RBAC-gated at the API.
// Notes are append-only with full version history (amendments add a version,
// never overwrite). Problem list / allergies / medications / obstetric history
// are captured as structured fields inside the note body for now; dedicated
// coded entities are a documented Phase-1 follow-on.

export type EncounterId = Id<"Encounter">;
export type NoteId = Id<"ClinicalNote">;
export type OrderId = Id<"Order">;
export type ResultId = Id<"Result">;
export type LetterId = Id<"Letter">;

export type EncounterType = "new_fertility" | "follow_up" | "antenatal" | "gynae" | "post_op";
export type EncounterStatus = "open" | "closed";

export interface Encounter {
  readonly id: EncounterId;
  readonly patientId: string;
  readonly type: EncounterType;
  readonly practitionerId: string;
  readonly status: EncounterStatus;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

/** One immutable version of a note. Amendments append a new version. */
export interface NoteVersion {
  readonly version: number;
  /** Structured + free-text content (history, exam, plan, problem list, etc.). */
  readonly body: Record<string, unknown>;
  readonly authorId: string;
  readonly at: string;
}

export interface ClinicalNote {
  readonly id: NoteId;
  readonly encounterId: EncounterId;
  readonly patientId: string;
  readonly versions: readonly NoteVersion[];
}

export type OrderKind = "lab" | "imaging" | "referral";
export type OrderStatus = "ordered" | "resulted" | "acknowledged" | "cancelled";

export interface Order {
  readonly id: OrderId;
  readonly encounterId: EncounterId;
  readonly patientId: string;
  readonly kind: OrderKind;
  readonly code: string;
  readonly status: OrderStatus;
  readonly orderedBy: string;
  readonly at: string;
}

export type ResultStatus = "unacknowledged" | "acknowledged";

export interface Result {
  readonly id: ResultId;
  readonly orderId: OrderId;
  readonly patientId: string;
  readonly summary: string;
  readonly abnormal: boolean;
  readonly status: ResultStatus;
  readonly filedAt: string;
  readonly acknowledgedBy: string | null;
}

export type LetterStatus = "draft" | "signed";

export interface Letter {
  readonly id: LetterId;
  readonly patientId: string;
  readonly templateKey: string;
  readonly locale: "en" | "ar";
  readonly body: string;
  readonly status: LetterStatus;
  readonly signedBy: string | null;
  readonly signedAt: string | null;
}
