import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  PregnancyTest,
  ClinicalAssessment,
  PregnancyOutcome,
  CycleOutcomeSummary,
  OutcomeKpiInputs,
  OutcomeType,
} from "./types.js";
import type { OutcomesStore } from "./store.js";
import { classifyBetaHcg, isClinicalPregnancy, deriveKpiInputs } from "./outcome-logic.js";
import { buildRegistryExport, type RegistryCycleInput, type RegistryRow } from "./research-export.js";

export interface RecordTestInput {
  readonly cycleId: string;
  readonly betaHcgMiuMl: number;
  readonly testedAt: string;
  /** Optional protocol-specific positive threshold (defaults to module default). */
  readonly threshold?: number;
}
export interface RecordAssessmentInput {
  readonly cycleId: string;
  readonly gestationalSacs: number;
  readonly fetalHeartbeats: number;
  readonly assessedAt: string;
}
export interface RecordOutcomeInput {
  readonly cycleId: string;
  readonly type: OutcomeType;
  readonly liveBirthCount?: number;
  readonly gestationalAgeWeeks?: number;
  readonly occurredAt: string;
  readonly note?: string;
}

/**
 * Outcome tracking — the fertility → pregnancy → live-birth continuum. Every
 * record links back to the originating cycle (`cycleId`). Records are audited and
 * event-emitting; the continuum reconstructs from the store. KPI computation is
 * Phase 5 — this captures the inputs.
 */
export class OutcomesService {
  constructor(
    private readonly store: OutcomesStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async recordPregnancyTest(actorId: string, input: RecordTestInput): Promise<Result<PregnancyTest, AppError>> {
    const classified = classifyBetaHcg(input.betaHcgMiuMl, input.threshold);
    if (!classified.ok) return err(classified.error);
    const test: PregnancyTest = {
      id: newId<"PregnancyTest">(),
      cycleId: input.cycleId,
      betaHcgMiuMl: input.betaHcgMiuMl,
      result: classified.value,
      testedAt: input.testedAt,
      recordedBy: actorId,
    };
    await this.store.saveTest(test);
    await this.audit.record({ actorId, entityType: "PregnancyTest", entityId: test.id, action: "CREATE", after: { cycleId: input.cycleId, result: test.result } });
    await this.events.emit({ type: "PregnancyTestRecorded", aggregateType: "Cycle", aggregateId: input.cycleId, data: { result: test.result } });
    return ok(test);
  }

  async recordClinicalAssessment(actorId: string, input: RecordAssessmentInput): Promise<ClinicalAssessment> {
    const assessment: ClinicalAssessment = {
      id: newId<"ClinicalAssessment">(),
      cycleId: input.cycleId,
      gestationalSacs: input.gestationalSacs,
      fetalHeartbeats: input.fetalHeartbeats,
      clinicalPregnancy: isClinicalPregnancy(input.gestationalSacs),
      assessedAt: input.assessedAt,
      recordedBy: actorId,
    };
    await this.store.saveAssessment(assessment);
    await this.audit.record({ actorId, entityType: "ClinicalAssessment", entityId: assessment.id, action: "CREATE", after: { cycleId: input.cycleId, clinicalPregnancy: assessment.clinicalPregnancy } });
    await this.events.emit({ type: "ClinicalPregnancyAssessed", aggregateType: "Cycle", aggregateId: input.cycleId, data: { clinicalPregnancy: assessment.clinicalPregnancy } });
    return assessment;
  }

  async recordPregnancyOutcome(actorId: string, input: RecordOutcomeInput): Promise<Result<PregnancyOutcome, AppError>> {
    const liveBirthCount = input.liveBirthCount ?? 0;
    if (input.type === "live_birth" && liveBirthCount < 1) {
      return err(validationError("a live birth requires a live-birth count of at least 1", "outcomes.live_birth.count_required"));
    }
    if (!Number.isInteger(liveBirthCount) || liveBirthCount < 0) {
      return err(validationError("live-birth count must be a non-negative integer", "outcomes.live_birth.bad_count"));
    }
    const outcome: PregnancyOutcome = {
      id: newId<"PregnancyOutcome">(),
      cycleId: input.cycleId,
      type: input.type,
      liveBirthCount,
      gestationalAgeWeeks: input.gestationalAgeWeeks ?? null,
      occurredAt: input.occurredAt,
      note: input.note ?? null,
      recordedBy: actorId,
    };
    await this.store.saveOutcome(outcome);
    await this.audit.record({ actorId, entityType: "PregnancyOutcome", entityId: outcome.id, action: "CREATE", after: { cycleId: input.cycleId, type: input.type } });
    await this.events.emit({ type: "PregnancyOutcomeRecorded", aggregateType: "Cycle", aggregateId: input.cycleId, data: { type: input.type, liveBirthCount } });
    return ok(outcome);
  }

  /** Reconstruct the continuum for a cycle (latest record at each stage). */
  async outcomeForCycle(cycleId: string): Promise<CycleOutcomeSummary> {
    const [tests, assessments, outcomes] = await Promise.all([
      this.store.testsForCycle(cycleId),
      this.store.assessmentsForCycle(cycleId),
      this.store.outcomesForCycle(cycleId),
    ]);
    return {
      cycleId,
      test: tests.at(-1) ?? null,
      clinicalAssessment: assessments.at(-1) ?? null,
      outcome: outcomes.at(-1) ?? null,
    };
  }

  /** Vienna-consensus KPI input booleans for a cycle. */
  async kpiInputs(cycleId: string): Promise<OutcomeKpiInputs> {
    return deriveKpiInputs(await this.outcomeForCycle(cycleId));
  }

  /**
   * De-identified research / registry export (docs/01 §E11 P2). The caller
   * assembles per-cycle facts (no PHI — clinical counts + age in years +
   * pseudonymisable refs); this de-identifies them (salted-hash keys, banded age,
   * ESHRE-shaped fields) and audits the export as a sensitive read (READ_EXPORT).
   * The salt is a residency-controlled secret supplied by the app.
   */
  async researchExport(actorId: string, inputs: readonly RegistryCycleInput[], salt: string): Promise<readonly RegistryRow[]> {
    const rows = buildRegistryExport(inputs, salt);
    await this.audit.record({ actorId, entityType: "ResearchRegistryExport", entityId: `cycles:${rows.length}`, action: "READ_EXPORT", after: { cycles: rows.length } });
    return rows;
  }
}
