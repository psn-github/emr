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
export type PregnancyId = Id<"Pregnancy">;
export type AntenatalVisitId = Id<"AntenatalVisit">;
export type DrugAllergyId = Id<"DrugAllergy">;

// Coded drug-allergy list (docs/01 §E8: prescribing "checks allergies"). Until
// now allergies lived only as free text inside note bodies (see the header note);
// this is the structured, matchable representation that lets prescribing run an
// ADVISORY allergy check (ADR-0060). Append-only / soft-delete like all clinical
// data: an allergy is retired (active=false), never hard-deleted. Matched by drug
// CLASS — the formulary's natural axis — held here as an opaque string so the
// clinical module stays independent of the fertility formulary (module boundaries).
export type AllergySeverity = "mild" | "moderate" | "severe";

export interface DrugAllergy {
  readonly id: DrugAllergyId;
  readonly patientId: string;
  /** Formulary drug-class code (opaque string; the fertility formulary owns the
   *  canonical enum). A prescription of this class raises an advisory. */
  readonly drugClass: string;
  /** Bilingual display label for the offending substance/class. */
  readonly substance: { readonly ar: string; readonly en: string };
  readonly severity: AllergySeverity;
  /** Free-text reaction description (optional). */
  readonly reaction: string | null;
  readonly recordedBy: string;
  readonly recordedAt: string;
  /** Soft-delete: a retired allergy is retained for audit, never matched. */
  readonly active: boolean;
  readonly retiredBy: string | null;
  readonly retiredAt: string | null;
}

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
  /** A result is invisible in the patient portal until a clinician releases it
   *  (ADR-0042). Released results carry who/when. */
  readonly releasedToPatient: boolean;
  readonly releasedAt: string | null;
  readonly releasedBy: string | null;
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

// Clinical pathways / order sets (docs/01 §E13 P1): a named, versioned bundle of
// orders for a scenario (e.g. "early pregnancy", "recurrent miscarriage workup").
// Applying a set places all its orders at once. Config — bilingual, no free text.
export interface OrderSetItem {
  readonly kind: OrderKind;
  readonly code: string;
  readonly label: { readonly ar: string; readonly en: string };
}

export interface OrderSet {
  readonly id: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly items: readonly OrderSetItem[];
  readonly active: boolean;
}

// Antenatal record / obstetric continuum (docs/01 §E2 P1): Oxford uniquely carries
// fertility patients into delivery. A pregnancy carries booking data + an EDD; serial
// antenatal visits capture vitals/growth and derive risk flags.
export type PregnancyStatus = "active" | "closed";

export interface Pregnancy {
  readonly id: PregnancyId;
  readonly patientId: string;
  /** Last menstrual period (ISO date); the dating anchor. */
  readonly lmp: string;
  /** Estimated delivery date (Naegele's rule from LMP). */
  readonly edd: string;
  readonly gravida: number;
  readonly para: number;
  /** Booking risk factors (coded strings; e.g. prior_pre_eclampsia, diabetes). */
  readonly riskFactors: readonly string[];
  readonly status: PregnancyStatus;
  readonly bookedBy: string;
  readonly bookedAt: string;
}

export interface AntenatalVisit {
  readonly id: AntenatalVisitId;
  readonly pregnancyId: PregnancyId;
  readonly patientId: string;
  readonly visitAt: string;
  readonly gestationWeeks: number;
  readonly bpSystolic: number;
  readonly bpDiastolic: number;
  readonly fundalHeightCm: number | null;
  readonly proteinuria: boolean;
  readonly presentation: string | null;
  readonly fetalHeartRate: number | null;
  /** Derived clinical risk flags for this visit (e.g. hypertension). */
  readonly riskFlags: readonly string[];
  readonly note: string | null;
  readonly recordedBy: string;
}
