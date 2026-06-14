import type { LabQcParameter, LabQcStatus } from "./types.js";

// Lab QC parameters (versioned config — docs/01 §E5 P1, CLAUDE.md "configuration
// is data"). Acceptable ranges are editable by authorised users without code
// changes; bilingual. A reading outside [min, max] fails QC and raises an event.

export const SEED_QC_PARAMETERS: readonly LabQcParameter[] = [
  { code: "incubator_co2", name: { ar: "ثاني أكسيد الكربون في الحاضنة", en: "Incubator CO₂" }, unit: "%", min: 5.5, max: 6.5, active: true },
  { code: "incubator_o2", name: { ar: "الأكسجين في الحاضنة", en: "Incubator O₂" }, unit: "%", min: 4.5, max: 5.5, active: true },
  { code: "incubator_temp", name: { ar: "حرارة الحاضنة", en: "Incubator temperature" }, unit: "°C", min: 36.8, max: 37.2, active: true },
  { code: "media_ph", name: { ar: "حموضة الوسط", en: "Media pH" }, unit: "pH", min: 7.2, max: 7.4, active: true },
  { code: "media_osmolality", name: { ar: "أسمولالية الوسط", en: "Media osmolality" }, unit: "mOsm/kg", min: 255, max: 295, active: true },
];

/** Evaluate a reading against a parameter's acceptable range. */
export function evaluateReading(p: LabQcParameter, value: number): { readonly inRange: boolean; readonly status: LabQcStatus } {
  const inRange = value >= p.min && value <= p.max;
  return { inRange, status: inRange ? "pass" : "fail" };
}

/** Lookup surface for QC parameters (own-module config). */
export interface QcParameterStore {
  get(code: string): Promise<LabQcParameter | null>;
  listActive(): Promise<readonly LabQcParameter[]>;
}

/** In-memory QC parameter store seeded from a set (defaults to the seed list). */
export class InMemoryQcParameterStore implements QcParameterStore {
  private readonly byCode: Map<string, LabQcParameter>;
  constructor(params: readonly LabQcParameter[] = SEED_QC_PARAMETERS) {
    this.byCode = new Map(params.map((p) => [p.code, p]));
  }
  async get(code: string): Promise<LabQcParameter | null> {
    return this.byCode.get(code) ?? null;
  }
  async listActive(): Promise<readonly LabQcParameter[]> {
    return [...this.byCode.values()].filter((p) => p.active);
  }
}
