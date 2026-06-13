// Cliniko export source shapes (the "from" side). We ingest a parsed export
// (JSON), not a live connection — Cliniko stays the read-only archive (ADR-0017,
// Option B). Only the ACTIVE slice is migrated: active patients + demographics,
// upcoming appointments, open balances.

export interface ClinikoPatient {
  readonly id: string;
  readonly firstNameEn: string;
  readonly lastNameEn: string;
  readonly firstNameAr?: string;
  readonly lastNameAr?: string;
  readonly civilId: string;
  readonly dob: string; // YYYY-MM-DD
  readonly sex: "male" | "female";
  readonly nationality: string;
  readonly preferredLanguage?: "en" | "ar";
  readonly phone?: string;
  readonly email?: string;
  readonly archived: boolean;
}

export interface ClinikoInvoice {
  readonly id: string;
  readonly patientId: string;
  readonly descriptionEn: string;
  readonly descriptionAr?: string;
  /** Outstanding balance in fils (integer). */
  readonly outstandingFils: number;
}

export interface ClinikoAppointment {
  readonly id: string;
  readonly patientId: string;
  readonly practitionerId: string;
  readonly startsAt: string; // ISO
  readonly endsAt: string; // ISO
  readonly cancelled: boolean;
}

export interface ClinikoExport {
  readonly patients: readonly ClinikoPatient[];
  readonly invoices: readonly ClinikoInvoice[];
  readonly appointments: readonly ClinikoAppointment[];
}
