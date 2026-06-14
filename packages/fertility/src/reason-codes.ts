import type { CancellationCategory, CancellationReasonCode } from "./types.js";

// Cancellation reason codes (versioned config — docs/01 §E3 P1, CLAUDE.md
// "configuration is data"). Cancellation/conversion reasons are CODED, never free
// text, so the Phase-5 KPI layer can aggregate cancellation rate by category and
// conversion rate. Editable by authorised users without code changes; bilingual.

/** The reserved category for the source side of a conversion (excluded from the
 *  true cancellation rate; conversions are counted via the linked new cycle). */
export const CONVERSION_CATEGORY: CancellationCategory = "converted";

export const SEED_CANCELLATION_REASONS: readonly CancellationReasonCode[] = [
  { code: "poor_ovarian_response", category: "poor_response", name: { ar: "استجابة مبيضية ضعيفة", en: "Poor ovarian response" }, active: true },
  { code: "ohss_risk", category: "ohss_risk", name: { ar: "خطر فرط تنبيه المبيض", en: "OHSS risk" }, active: true },
  { code: "medical_contraindication", category: "clinical", name: { ar: "موانع طبية", en: "Medical contraindication" }, active: true },
  { code: "no_follicular_growth", category: "clinical", name: { ar: "عدم نمو الجريبات", en: "No follicular growth" }, active: true },
  { code: "patient_withdrew", category: "patient_choice", name: { ar: "انسحاب المريضة", en: "Patient withdrew" }, active: true },
  { code: "personal_reasons", category: "patient_choice", name: { ar: "أسباب شخصية", en: "Personal reasons" }, active: true },
  { code: "scheduling_conflict", category: "administrative", name: { ar: "تعارض في الجدولة", en: "Scheduling conflict" }, active: true },
  { code: "funding_unavailable", category: "administrative", name: { ar: "عدم توفر التمويل", en: "Funding unavailable" }, active: true },
  // Conversion reasons (source side of an IVF↔IUI / IVF↔ICSI etc. conversion).
  { code: "converted_to_iui", category: "converted", name: { ar: "تحويل إلى تلقيح داخل الرحم", en: "Converted to IUI" }, active: true },
  { code: "converted_to_ivf", category: "converted", name: { ar: "تحويل إلى أطفال الأنابيب", en: "Converted to IVF" }, active: true },
  { code: "converted_to_icsi", category: "converted", name: { ar: "تحويل إلى الحقن المجهري", en: "Converted to ICSI" }, active: true },
];

/** Lookup surface for cancellation reason codes (own-module config). */
export interface ReasonCodeStore {
  get(code: string): Promise<CancellationReasonCode | null>;
  listActive(): Promise<readonly CancellationReasonCode[]>;
}

/** In-memory reason store seeded from a code set (defaults to the seed list). */
export class InMemoryReasonCodeStore implements ReasonCodeStore {
  private readonly byCode: Map<string, CancellationReasonCode>;
  constructor(reasons: readonly CancellationReasonCode[] = SEED_CANCELLATION_REASONS) {
    this.byCode = new Map(reasons.map((r) => [r.code, r]));
  }
  async get(code: string): Promise<CancellationReasonCode | null> {
    return this.byCode.get(code) ?? null;
  }
  async listActive(): Promise<readonly CancellationReasonCode[]> {
    return [...this.byCode.values()].filter((r) => r.active);
  }
}
