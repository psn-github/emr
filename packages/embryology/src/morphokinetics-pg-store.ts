import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { EmbryoId, EventTimings, IntervalTimings, MorphokineticAnnotation, MorphokineticRange, MorphokineticVarCode } from "./types.js";
import type { MorphokineticRangeStore } from "./morphokinetics.js";
import type { MorphokineticAnnotationStore } from "./morphokinetics-store.js";

/** Postgres-backed morphokinetic optimal-range config. */
export class PgMorphokineticRangeStore implements MorphokineticRangeStore {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<readonly MorphokineticRange[]> {
    const r = await this.pool.query<RangeRow>("SELECT * FROM embryology.morphokinetic_range ORDER BY code");
    return r.rows.map(rangeFromRow);
  }
}

/** Postgres-backed morphokinetic annotation store. */
export class PgMorphokineticAnnotationStore implements MorphokineticAnnotationStore {
  constructor(private readonly pool: Pool) {}

  async save(a: MorphokineticAnnotation): Promise<void> {
    await this.pool.query(
      `INSERT INTO embryology.morphokinetic_annotation (id, embryo_id, source, events, intervals, in_range, score, monitored, flags, annotated_by, annotated_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.embryoId, a.source, JSON.stringify(a.events), JSON.stringify(a.intervals), JSON.stringify(a.inRange), a.score, a.monitored, JSON.stringify(a.flags), a.annotatedBy, a.annotatedAt, a.note],
    );
  }
  async forEmbryo(embryoId: EmbryoId): Promise<readonly MorphokineticAnnotation[]> {
    const r = await this.pool.query<AnnotationRow>("SELECT * FROM embryology.morphokinetic_annotation WHERE embryo_id = $1 ORDER BY annotated_at DESC", [embryoId]);
    return r.rows.map(annotationFromRow);
  }
}

/** Idempotently seed morphokinetic ranges (config-as-data; safe to re-run). */
export async function seedMorphokineticRanges(pool: Pool, ranges: readonly MorphokineticRange[]): Promise<void> {
  for (const r of ranges) {
    await pool.query(
      `INSERT INTO embryology.morphokinetic_range (code, name_ar, name_en, optimal_min, optimal_max)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en,
         optimal_min=EXCLUDED.optimal_min, optimal_max=EXCLUDED.optimal_max`,
      [r.code, r.name.ar, r.name.en, r.optimalMin, r.optimalMax],
    );
  }
}

interface RangeRow { code: string; name_ar: string; name_en: string; optimal_min: string; optimal_max: string }
interface AnnotationRow { id: string; embryo_id: string; source: string; events: EventTimings; intervals: IntervalTimings; in_range: Partial<Record<MorphokineticVarCode, boolean>>; score: number; monitored: number; flags: string[]; annotated_by: string; annotated_at: Date; note: string | null }

function rangeFromRow(r: RangeRow): MorphokineticRange {
  return { code: r.code as MorphokineticVarCode, name: { ar: r.name_ar, en: r.name_en }, optimalMin: Number(r.optimal_min), optimalMax: Number(r.optimal_max) };
}
function annotationFromRow(r: AnnotationRow): MorphokineticAnnotation {
  return {
    id: asId<"MorphokineticAnnotation">(r.id),
    embryoId: asId<"Embryo">(r.embryo_id),
    source: r.source,
    events: r.events,
    intervals: r.intervals,
    inRange: r.in_range,
    score: r.score,
    monitored: r.monitored,
    flags: r.flags,
    annotatedBy: r.annotated_by,
    annotatedAt: new Date(r.annotated_at).toISOString(),
    note: r.note,
  };
}
