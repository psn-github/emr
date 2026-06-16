import type { AdvancedTestSpec, SpermTestInterpretation } from "./types.js";

// Advanced sperm test specs (versioned config — docs/01 §E5 P1, CLAUDE.md
// "configuration is data"). Each carries a direction + two thresholds; a value is
// interpreted normal / borderline / abnormal. Editable without code changes.
// Defaults follow common andrology cut-offs (clinic-overridable).

export const SEED_ADVANCED_TEST_SPECS: readonly AdvancedTestSpec[] = [
  // DNA Fragmentation Index: higher is worse (≤15 normal, ≤30 borderline, >30 abnormal).
  { code: "dfi", name: { ar: "مؤشر تجزؤ الحمض النووي", en: "DNA fragmentation index (DFI)" }, unit: "%", direction: "higher_worse", normalThreshold: 15, borderlineThreshold: 30, active: true },
  // Reactive oxygen species: higher is worse.
  { code: "ros", name: { ar: "الأنواع التفاعلية للأكسجين", en: "Reactive oxygen species (ROS)" }, unit: "RLU/s/10⁶", direction: "higher_worse", normalThreshold: 20, borderlineThreshold: 40, active: true },
  // Sperm aneuploidy (FISH): higher is worse.
  { code: "aneuploidy_fish", name: { ar: "اختلال الصبغيات", en: "Sperm aneuploidy (FISH)" }, unit: "%", direction: "higher_worse", normalThreshold: 1.5, borderlineThreshold: 3, active: true },
  // Hyaluronan binding assay: higher is BETTER (≥80 normal, ≥65 borderline, <65 abnormal).
  { code: "hba", name: { ar: "اختبار ارتباط الهيالورونان", en: "Hyaluronan binding assay (HBA)" }, unit: "%", direction: "higher_better", normalThreshold: 80, borderlineThreshold: 65, active: true },
];

/** Interpret a value against its spec, honouring the test's direction. */
export function interpret(spec: AdvancedTestSpec, value: number): SpermTestInterpretation {
  if (spec.direction === "higher_worse") {
    if (value <= spec.normalThreshold) return "normal";
    if (value <= spec.borderlineThreshold) return "borderline";
    return "abnormal";
  }
  if (value >= spec.normalThreshold) return "normal";
  if (value >= spec.borderlineThreshold) return "borderline";
  return "abnormal";
}

/** Lookup surface for advanced test specs (own-module config). */
export interface AdvancedTestSpecStore {
  get(code: string): Promise<AdvancedTestSpec | null>;
  listActive(): Promise<readonly AdvancedTestSpec[]>;
}

/** In-memory spec store seeded from a set (defaults to the seed list). */
export class InMemoryAdvancedTestSpecStore implements AdvancedTestSpecStore {
  private readonly byCode: Map<string, AdvancedTestSpec>;
  constructor(specs: readonly AdvancedTestSpec[] = SEED_ADVANCED_TEST_SPECS) {
    this.byCode = new Map(specs.map((s) => [s.code, s]));
  }
  async get(code: string): Promise<AdvancedTestSpec | null> {
    return this.byCode.get(code) ?? null;
  }
  async listActive(): Promise<readonly AdvancedTestSpec[]> {
    return [...this.byCode.values()].filter((s) => s.active);
  }
}
