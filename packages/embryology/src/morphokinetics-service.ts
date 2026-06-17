import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Embryo, EmbryoId, EventTimings, MorphokineticAnnotation, MorphokineticRange } from "./types.js";
import { assessMorphokinetics, validateEventOrder, type MorphokineticRangeStore } from "./morphokinetics.js";
import type { MorphokineticAnnotationStore } from "./morphokinetics-store.js";

/** Minimal embryo lookup the service needs (satisfied by EmbryologyStore). */
export interface EmbryoLookup {
  embryoById(id: EmbryoId): Promise<Embryo | undefined>;
}

export interface RecordAnnotationInput {
  readonly embryoId: string;
  readonly source: string;
  readonly events: EventTimings;
  readonly annotatedAt: string;
  readonly note?: string;
}

/**
 * Time-lapse morphokinetic analytics (docs/01 §E4 P2). Imports a per-embryo
 * annotation (timings in hpi), derives the standard intervals, scores how many
 * key variables sit in their optimal range, and flags known exclusion patterns
 * (direct cleavage) — analytics SURFACED to embryologists, never an auto-select.
 * Optimal ranges are config. Every annotation is audited.
 */
export class MorphokineticsService {
  constructor(
    private readonly embryos: EmbryoLookup,
    private readonly ranges: MorphokineticRangeStore,
    private readonly store: MorphokineticAnnotationStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  /** The optimal-range config (for the annotation/review UI). */
  listRanges(): Promise<readonly MorphokineticRange[]> {
    return this.ranges.list();
  }

  async recordAnnotation(actorId: string, input: RecordAnnotationInput): Promise<Result<MorphokineticAnnotation, AppError>> {
    const embryo = await this.embryos.embryoById(input.embryoId as EmbryoId);
    if (embryo === undefined) return err(notFound("embryo not found", "embryology.morphokinetics.embryo_not_found"));
    const orderError = validateEventOrder(input.events);
    if (orderError !== null) return err(validationError(`invalid morphokinetic timings: ${orderError}`, `embryology.morphokinetics.${orderError}`));

    const assessment = assessMorphokinetics(input.events, await this.ranges.list());
    const annotation: MorphokineticAnnotation = {
      id: newId<"MorphokineticAnnotation">(),
      embryoId: embryo.id,
      source: input.source,
      events: input.events,
      intervals: assessment.intervals,
      inRange: assessment.inRange,
      score: assessment.score,
      monitored: assessment.monitored,
      flags: assessment.flags,
      annotatedBy: actorId,
      annotatedAt: input.annotatedAt,
      note: input.note ?? null,
    };
    await this.store.save(annotation);
    await this.audit.record({ actorId, entityType: "MorphokineticAnnotation", entityId: annotation.id, action: "CREATE", after: { embryoId: embryo.id, score: assessment.score, monitored: assessment.monitored, flags: assessment.flags } });
    await this.events.emit({ type: "MorphokineticAnnotationRecorded", aggregateType: "Embryo", aggregateId: embryo.id, data: { score: assessment.score, monitored: assessment.monitored } });
    if (assessment.flags.length > 0) {
      await this.events.emit({ type: "MorphokineticFlagged", aggregateType: "Embryo", aggregateId: embryo.id, data: { flags: assessment.flags } });
    }
    return ok(annotation);
  }

  annotationsForEmbryo(embryoId: EmbryoId): Promise<readonly MorphokineticAnnotation[]> {
    return this.store.forEmbryo(embryoId);
  }
}
