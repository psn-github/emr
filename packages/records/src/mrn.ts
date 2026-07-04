// Pure MRN (medical record number) format logic (ADR-0065). A human-friendly,
// unique, never-reused clinic file number. Default format `OM-<year>-<5-digit
// seq>`; the format is CONFIGURATION (prefix + sequence width), not hardcoded,
// so the clinic can change it without a code change. Legacy (Cliniko-era) file
// numbers are imported verbatim and need NOT match this format — only allocated
// numbers do. Held to 100% coverage.

export interface MrnFormat {
  /** Leading prefix, e.g. "OM". */
  readonly prefix: string;
  /** Zero-padded width of the per-year sequence, e.g. 5 → "00042". */
  readonly seqWidth: number;
}

/** Default clinic MRN format (ADR-0065): `OM-<year>-<5-digit seq>`. */
export const DEFAULT_MRN_FORMAT: MrnFormat = { prefix: "OM", seqWidth: 5 };

/** Render an allocated MRN from its parts. Deterministic. */
export function formatMrn(fmt: MrnFormat, year: number, seq: number): string {
  return `${fmt.prefix}-${year}-${String(seq).padStart(fmt.seqWidth, "0")}`;
}

/** Whether a string is a well-formed ALLOCATED MRN for the given format. Legacy
 *  imported numbers are not required to satisfy this (they predate the scheme). */
export function isWellFormedMrn(fmt: MrnFormat, mrn: string): boolean {
  const re = new RegExp(`^${escapeRegExp(fmt.prefix)}-\\d{4}-\\d{${fmt.seqWidth}}$`);
  return re.test(mrn);
}

/** A candidate MRN for import must be non-empty and free of surrounding blanks
 *  (so barcodes/labels never carry stray whitespace). */
export function isImportableMrn(mrn: string): boolean {
  return mrn.length > 0 && mrn === mrn.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
