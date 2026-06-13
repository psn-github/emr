import type { Result, AppError } from "@oxford/core";
import { ok, err, newId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { PreOpAssessment } from "./types.js";
import type { PreOpStore } from "./preop-store.js";
import { validatePreOp } from "./preop.js";

export interface RecordPreOpInput {
  readonly encounterId: string;
  readonly anaestheticHistory: string;
  readonly mallampatiClass: number;
  readonly asaGrade: number;
  readonly investigations?: readonly string[];
  readonly fastingConfirmed: boolean;
  readonly consentRef: string;
  readonly assessedAt: string;
}

/** Pre-operative assessment record (anaesthetic history, airway, ASA, fasting,
 *  consent). Validated before it is accepted; one assessment per encounter. */
export class PreOpService {
  constructor(
    private readonly store: PreOpStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async recordPreOp(actorId: string, input: RecordPreOpInput): Promise<Result<PreOpAssessment, AppError>> {
    const valid = validatePreOp(input);
    if (!valid.ok) return err(valid.error);
    const assessment: PreOpAssessment = {
      id: newId<"PreOpAssessment">(),
      encounterId: input.encounterId,
      anaestheticHistory: input.anaestheticHistory,
      mallampatiClass: input.mallampatiClass,
      asaGrade: input.asaGrade,
      investigations: input.investigations ?? [],
      fastingConfirmed: input.fastingConfirmed,
      consentRef: input.consentRef,
      assessedBy: actorId,
      assessedAt: input.assessedAt,
    };
    await this.store.save(assessment);
    await this.audit.record({ actorId, entityType: "PreOpAssessment", entityId: assessment.id, action: "CREATE", after: { encounterId: input.encounterId, asaGrade: input.asaGrade } });
    await this.events.emit({ type: "PreOpAssessmentRecorded", aggregateType: "SurgicalEncounter", aggregateId: input.encounterId, data: { asaGrade: input.asaGrade } });
    return ok(assessment);
  }

  forEncounter(encounterId: string): Promise<PreOpAssessment | undefined> {
    return this.store.forEncounter(encounterId);
  }
}
