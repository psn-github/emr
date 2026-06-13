import type { ClinikoExport, ClinikoInvoice, ClinikoPatient } from "./source.js";

// Pure mapping + reconciliation. Returns PLAIN shapes (not domain types) so this
// package stays a leaf — the app layer adapts these into registry/billing inputs.

export interface MappedPerson {
  readonly sourceId: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly civilId: string;
  readonly dob: string;
  readonly sex: "male" | "female";
  readonly nationality: string;
  readonly languagePref: "en" | "ar";
  readonly phone?: string;
  readonly email?: string;
}

export interface MappedInvoice {
  readonly sourceId: string;
  readonly patientSourceId: string;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly outstandingFils: number;
}

/** Active patients only (not archived) — the cutover slice (Option B). */
export function activePatients(exp: ClinikoExport): readonly ClinikoPatient[] {
  return exp.patients.filter((p) => !p.archived);
}

/** Invoices with an outstanding balance. */
export function openInvoices(exp: ClinikoExport): readonly ClinikoInvoice[] {
  return exp.invoices.filter((i) => i.outstandingFils > 0);
}

export function mapPatient(c: ClinikoPatient): MappedPerson {
  const nameAr = c.firstNameAr && c.lastNameAr ? `${c.firstNameAr} ${c.lastNameAr}` : `${c.firstNameEn} ${c.lastNameEn}`;
  return {
    sourceId: c.id,
    nameAr,
    nameEn: `${c.firstNameEn} ${c.lastNameEn}`,
    civilId: c.civilId,
    dob: c.dob,
    sex: c.sex,
    nationality: c.nationality,
    languagePref: c.preferredLanguage ?? "ar",
    ...(c.phone ? { phone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
  };
}

export function mapInvoice(c: ClinikoInvoice): MappedInvoice {
  return {
    sourceId: c.id,
    patientSourceId: c.patientId,
    descriptionAr: c.descriptionAr ?? c.descriptionEn,
    descriptionEn: c.descriptionEn,
    outstandingFils: c.outstandingFils,
  };
}

export interface ReconciliationReport {
  readonly total: number;
  readonly imported: number;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly clean: boolean;
}

/**
 * Reconcile expected source ids against what was imported. `clean` = every
 * source record imported and nothing imported that isn't in source — the
 * "zero unexplained discrepancies" gate (docs/05 Phase 1).
 */
export function reconcile(sourceIds: readonly string[], importedIds: ReadonlySet<string>): ReconciliationReport {
  const sourceSet = new Set(sourceIds);
  const missing = sourceIds.filter((id) => !importedIds.has(id));
  const extra = [...importedIds].filter((id) => !sourceSet.has(id));
  return { total: sourceSet.size, imported: importedIds.size, missing, extra, clean: missing.length === 0 && extra.length === 0 };
}
