import type { MorphokineticRange, MorphokineticEventCode, MorphokineticIntervalCode, MorphokineticVarCode, EventTimings, IntervalTimings } from "./types.js";

// Time-lapse morphokinetic analytics (docs/01 §E4 P2, "surfaced to embryologists").
// Annotations are timings in hours-post-insemination (hpi) imported from the
// time-lapse incubator. We derive the standard intervals, score how many key
// variables fall in their optimal range, and flag known exclusion patterns
// (direct cleavage). This SURFACES analytics — it never auto-selects an embryo.
// Optimal ranges are CONFIGURATION (CLAUDE.md "configuration is data").

/** Canonical chronological order of morphokinetic events (for order validation). */
export const EVENT_ORDER: readonly MorphokineticEventCode[] = ["tPNf", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "tM", "tSB", "tB"];

/** Direct (abnormal) cleavage: a 1→3 cell division in under this many hours (config). */
export const DIRECT_CLEAVAGE_MAX_HOURS = 5;

/** Default optimal ranges (hpi / hours), from common time-lapse literature; bilingual; clinic-overridable. */
export const MORPHOKINETIC_RANGES: readonly MorphokineticRange[] = [
  { code: "t2", name: { ar: "زمن الانقسام لخليتين", en: "t2 (2-cell)" }, optimalMin: 24, optimalMax: 28 },
  { code: "t3", name: { ar: "زمن الانقسام لثلاث خلايا", en: "t3 (3-cell)" }, optimalMin: 33, optimalMax: 40 },
  { code: "t5", name: { ar: "زمن الانقسام لخمس خلايا", en: "t5 (5-cell)" }, optimalMin: 46, optimalMax: 56 },
  { code: "cc2", name: { ar: "الدورة الخلوية الثانية", en: "cc2 (t3−t2)" }, optimalMin: 9, optimalMax: 12 },
  { code: "s2", name: { ar: "تزامن الانقسام الثاني", en: "s2 (t4−t3)" }, optimalMin: 0, optimalMax: 4 },
  { code: "t5_t2", name: { ar: "t5 ناقص t2", en: "t5−t2" }, optimalMin: 20, optimalMax: 28 },
];

/** Derived morphokinetic intervals, computed only when both endpoints are present. */
export function computeIntervals(e: EventTimings): IntervalTimings {
  const out: { -readonly [K in MorphokineticIntervalCode]?: number } = {};
  if (e.t2 !== undefined && e.t3 !== undefined) out.cc2 = e.t3 - e.t2;
  if (e.t3 !== undefined && e.t4 !== undefined) out.s2 = e.t4 - e.t3;
  if (e.t3 !== undefined && e.t5 !== undefined) out.cc3 = e.t5 - e.t3;
  if (e.t2 !== undefined && e.t5 !== undefined) out.t5_t2 = e.t5 - e.t2;
  return out;
}

/** Null if event timings are valid (each > 0 and strictly increasing in canonical
 *  order); otherwise a machine code describing the first problem. */
export function validateEventOrder(e: EventTimings): string | null {
  let prev = -Infinity;
  for (const code of EVENT_ORDER) {
    const v = e[code];
    if (v === undefined) continue;
    if (v <= 0) return "non_positive";
    if (v <= prev) return "out_of_order";
    prev = v;
  }
  return null;
}

export interface MorphokineticAssessment {
  readonly intervals: IntervalTimings;
  /** Per measured variable: whether it sits inside its optimal range. */
  readonly inRange: Partial<Record<MorphokineticVarCode, boolean>>;
  /** Count of monitored variables within their optimal range. */
  readonly score: number;
  /** Count of monitored variables that were actually measured. */
  readonly monitored: number;
  readonly flags: readonly string[];
}

const valueFor = (code: MorphokineticVarCode, e: EventTimings, intervals: IntervalTimings): number | undefined =>
  (code in intervals ? intervals[code as MorphokineticIntervalCode] : e[code as MorphokineticEventCode]);

/** Assess an annotation against the optimal ranges: intervals, per-variable in-range, score, flags. */
export function assessMorphokinetics(e: EventTimings, ranges: readonly MorphokineticRange[] = MORPHOKINETIC_RANGES): MorphokineticAssessment {
  const intervals = computeIntervals(e);
  const inRange: { -readonly [K in MorphokineticVarCode]?: boolean } = {};
  let score = 0;
  let monitored = 0;
  for (const r of ranges) {
    const v = valueFor(r.code, e, intervals);
    if (v === undefined) continue;
    monitored += 1;
    const ok = v >= r.optimalMin && v <= r.optimalMax;
    inRange[r.code] = ok;
    if (ok) score += 1;
  }
  const flags: string[] = [];
  if (intervals.cc2 !== undefined && intervals.cc2 < DIRECT_CLEAVAGE_MAX_HOURS) flags.push("direct_cleavage");
  return { intervals, inRange, score, monitored, flags };
}

/** Lookup surface for morphokinetic optimal ranges (own-module config). */
export interface MorphokineticRangeStore {
  list(): Promise<readonly MorphokineticRange[]>;
}

/** In-memory range store seeded from a set (defaults to the literature ranges). */
export class InMemoryMorphokineticRangeStore implements MorphokineticRangeStore {
  constructor(private readonly ranges: readonly MorphokineticRange[] = MORPHOKINETIC_RANGES) {}
  async list(): Promise<readonly MorphokineticRange[]> {
    return this.ranges;
  }
}
