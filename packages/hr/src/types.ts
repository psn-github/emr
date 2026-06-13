import type { Id } from "@oxford/core";

// Light HR types (docs/01 §E14, ADR-0040): staff registry, MOH licence +
// competency records (with expiry), and rota shifts that feed scheduling resource
// availability. Full payroll stays external.

export type StaffId = Id<"Staff">;
export type CredentialId = Id<"Credential">;
export type ShiftId = Id<"Shift">;

export interface Staff {
  readonly id: StaffId;
  readonly name: string;
  readonly role: string;
  /** MOH/professional registration id, where applicable. */
  readonly professionalId: string | null;
  readonly active: boolean;
}

/** A licence (MOH registration) or a competency sign-off — both expire. */
export type CredentialType = "licence" | "competency";

export interface Credential {
  readonly id: CredentialId;
  readonly staffId: string;
  readonly type: CredentialType;
  readonly name: string;
  readonly authority: string | null;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** A rota shift — feeds scheduling availability for a resource. */
export interface Shift {
  readonly id: ShiftId;
  readonly staffId: string;
  /** The scheduling resource this shift staffs (e.g. a theatre/clinic resource). */
  readonly resourceId: string;
  readonly start: string;
  readonly end: string;
  readonly role: string;
}
