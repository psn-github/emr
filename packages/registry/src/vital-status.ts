import type { Id } from "@oxford/core";
import type { PersonId } from "./person.js";

// Vital status — a CLINICIAN-ATTESTED death record (Medical Director decision,
// 2026-06-13). This is the authoritative source for the cryostore "no posthumous
// use" gate: a person-owned specimen may not be thawed for treatment once the
// owner has an attested death record. Created only by an authorised clinician;
// audited like every clinical mutation; soft data (never deleted).

export type DeathRecordId = Id<"DeathRecord">;

export interface DeathRecord {
  readonly id: DeathRecordId;
  readonly personId: PersonId;
  readonly dateOfDeath: string;
  /** The clinician (staff id) attesting the death. */
  readonly attestedBy: string;
  /** Reference to the death certificate in the document store. */
  readonly documentRef: string;
  readonly recordedAt: string;
}

/** A person is living iff there is no attested death record. */
export function personIsLiving(record: DeathRecord | null): boolean {
  return record === null;
}
