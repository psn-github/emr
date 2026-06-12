import type { Id } from "@oxford/core";
import type { EncryptedValue } from "@oxford/crypto";

export type PersonId = Id<"Person">;

export type Sex = "male" | "female";
export type LanguagePref = "en" | "ar";

export interface PersonName {
  /** Arabic name — first-class, not a transliteration afterthought. */
  readonly ar: string;
  readonly en: string;
}

export interface Contact {
  readonly phone?: string;
  readonly email?: string;
}

/**
 * A person. The Civil ID is SENSITIVE (docs/03 §4): it is held only as a
 * field-level-encrypted envelope (`civilIdEnc`) — the plaintext is never stored
 * on the record, never logged, and never placed in the audit before/after.
 * Clinical data is soft-deleted only (`deletedAt`).
 */
export interface Person {
  readonly id: PersonId;
  readonly name: PersonName;
  readonly civilIdEnc: EncryptedValue;
  readonly dob: string;
  readonly sex: Sex;
  readonly nationality: string;
  readonly languagePref: LanguagePref;
  readonly contact: Contact;
  readonly photoRef: string | null;
  /** Soft-delete / merge tombstone — never hard-deleted. */
  readonly deletedAt: string | null;
  /** Set when this record was merged into a surviving record. */
  readonly mergedInto: PersonId | null;
}

export interface RegisterPersonInput {
  readonly name: PersonName;
  /** Plaintext Civil ID — encrypted immediately on registration, then discarded. */
  readonly civilId: string;
  readonly dob: string;
  readonly sex: Sex;
  readonly nationality: string;
  readonly languagePref: LanguagePref;
  readonly contact?: Contact;
  readonly photoRef?: string;
}
