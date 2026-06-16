import type { Clock, Result as R, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { AntenatalVisit, Pregnancy, PregnancyId } from "./types.js";
import type { AntenatalStore } from "./antenatal-store.js";
import { estimateEdd, gestationWeeks, plannedVisits, assessVisit, type PlannedVisit } from "./antenatal.js";

export interface BookPregnancyInput {
  readonly patientId: string;
  readonly lmp: string;
  readonly gravida: number;
  readonly para: number;
  readonly riskFactors?: readonly string[];
}
export interface RecordVisitInput {
  readonly pregnancyId: string;
  readonly visitAt: string;
  readonly bpSystolic: number;
  readonly bpDiastolic: number;
  readonly fundalHeightCm?: number;
  readonly proteinuria?: boolean;
  readonly presentation?: string;
  readonly fetalHeartRate?: number;
  readonly note?: string;
}

/**
 * Antenatal record (docs/01 §E2 P1) — the obstetric continuum. Booking dates the
 * pregnancy (EDD by Naegele's rule) and generates a visit schedule; serial visits
 * capture vitals/growth and derive risk flags (hypertension, pre-eclampsia risk,
 * fundal-height discrepancy). All PHI; audited; RBAC-gated at the API.
 */
export class AntenatalService {
  constructor(
    private readonly store: AntenatalStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  /** Book (date) a pregnancy. One active pregnancy per patient at a time. */
  async bookPregnancy(actorId: string, input: BookPregnancyInput): Promise<R<Pregnancy, AppError>> {
    const existing = await this.store.activePregnancyForPatient(input.patientId);
    if (existing !== null) return err(validationError("patient already has an active pregnancy", "clinical.antenatal.already_active"));
    const pregnancy: Pregnancy = {
      id: newId<"Pregnancy">(),
      patientId: input.patientId,
      lmp: input.lmp,
      edd: estimateEdd(input.lmp),
      gravida: input.gravida,
      para: input.para,
      riskFactors: input.riskFactors ?? [],
      status: "active",
      bookedBy: actorId,
      bookedAt: this.clock.now().toISOString(),
    };
    await this.store.savePregnancy(pregnancy);
    await this.audit.record({ actorId, entityType: "Pregnancy", entityId: pregnancy.id, action: "CREATE", after: { patientId: input.patientId, edd: pregnancy.edd } });
    await this.events.emit({ type: "PregnancyBooked", aggregateType: "Pregnancy", aggregateId: pregnancy.id, data: { edd: pregnancy.edd } });
    return ok(pregnancy);
  }

  /** The planned antenatal visit schedule for a pregnancy (from LMP + config). */
  async plannedSchedule(pregnancyId: PregnancyId): Promise<R<readonly PlannedVisit[], AppError>> {
    const p = await this.store.getPregnancy(pregnancyId);
    if (p === null) return err(notFound("pregnancy not found", "clinical.antenatal.not_found"));
    return ok(plannedVisits(p.lmp));
  }

  /** Record an antenatal visit; gestation + risk flags are derived. */
  async recordVisit(actorId: string, input: RecordVisitInput): Promise<R<AntenatalVisit, AppError>> {
    const p = await this.store.getPregnancy(input.pregnancyId as PregnancyId);
    if (p === null) return err(notFound("pregnancy not found", "clinical.antenatal.not_found"));
    const weeks = gestationWeeks(p.lmp, input.visitAt);
    const riskFlags = assessVisit({
      gestationWeeks: weeks,
      bpSystolic: input.bpSystolic,
      bpDiastolic: input.bpDiastolic,
      fundalHeightCm: input.fundalHeightCm ?? null,
      proteinuria: input.proteinuria ?? false,
    });
    const visit: AntenatalVisit = {
      id: newId<"AntenatalVisit">(),
      pregnancyId: p.id,
      patientId: p.patientId,
      visitAt: input.visitAt,
      gestationWeeks: weeks,
      bpSystolic: input.bpSystolic,
      bpDiastolic: input.bpDiastolic,
      fundalHeightCm: input.fundalHeightCm ?? null,
      proteinuria: input.proteinuria ?? false,
      presentation: input.presentation ?? null,
      fetalHeartRate: input.fetalHeartRate ?? null,
      riskFlags,
      note: input.note ?? null,
      recordedBy: actorId,
    };
    await this.store.saveVisit(visit);
    await this.audit.record({ actorId, entityType: "AntenatalVisit", entityId: visit.id, action: "CREATE", after: { pregnancyId: p.id, gestationWeeks: weeks, riskFlags } });
    await this.events.emit({ type: "AntenatalVisitRecorded", aggregateType: "Pregnancy", aggregateId: p.id, data: { gestationWeeks: weeks } });
    if (riskFlags.length > 0) {
      await this.events.emit({ type: "AntenatalRiskFlagged", aggregateType: "Pregnancy", aggregateId: p.id, data: { riskFlags } });
    }
    return ok(visit);
  }

  pregnancy(id: PregnancyId): Promise<Pregnancy | null> {
    return this.store.getPregnancy(id);
  }
  activePregnancyForPatient(patientId: string): Promise<Pregnancy | null> {
    return this.store.activePregnancyForPatient(patientId);
  }
  visits(pregnancyId: PregnancyId): Promise<readonly AntenatalVisit[]> {
    return this.store.visitsForPregnancy(pregnancyId);
  }
}
