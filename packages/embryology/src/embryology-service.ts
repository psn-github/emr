import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  Oocyte,
  Insemination,
  FertilisationCheck,
  Embryo,
  GradingEntry,
  Disposition,
  EmbryoTransfer,
  MediaApplication,
  OocyteId,
  EmbryoId,
  Maturity,
  InseminationMethod,
  PnStatus,
  DispositionType,
  TransferDifficulty,
} from "./types.js";
import type { EmbryologyStore } from "./store.js";
import type { WitnessPort } from "./witness-port.js";
import { yieldsEmbryo } from "./fertilisation.js";
import { makeGardnerGrade } from "./grading.js";
import { validateMediaApplication, recallReachability, hasValue, type MediaApplicationInput, type RecallReach } from "./media.js";

export interface RecordOocyteInput {
  readonly cycleId: string;
  readonly retrievalProcedureId: string;
  readonly maturity: Maturity;
  readonly dish: string;
  readonly position: string;
}
export interface RecordInseminationInput {
  readonly cycleId: string;
  readonly oocyteId: OocyteId | string;
  readonly method: InseminationMethod;
  readonly spermSourceId: string;
  readonly operator: string;
  readonly inseminatedAt: string;
  /** Patient identity flows to the witnessing reconciliation (RI is master-fed). */
  readonly patientId: string;
}
export interface RecordCheckInput {
  readonly cycleId: string;
  readonly oocyteId: string;
  readonly pn: PnStatus;
  readonly checkedAt: string;
}
export interface RecordGradingInput {
  readonly embryoId: string;
  readonly day: number;
  readonly morphology: string;
  readonly gardner?: { readonly expansion: number; readonly icm: string; readonly te: string };
  readonly assessedAt: string;
}
export interface RecordDispositionInput {
  readonly cycleId: string;
  readonly embryoId: string;
  readonly type: DispositionType;
  readonly occurredAt: string;
  readonly operator: string;
  readonly patientId: string;
}
export interface RecordTransferInput {
  readonly cycleId: string;
  readonly embryoIds: readonly string[];
  readonly catheter: string;
  readonly difficulty: TransferDifficulty;
  readonly ultrasoundGuided: boolean;
  readonly procedureRef?: string;
  readonly operator: string;
  readonly transferredAt: string;
  readonly patientId: string;
}

export interface CheckResult {
  readonly check: FertilisationCheck;
  /** A normal-fertilisation (2PN) check creates a culture embryo; else null. */
  readonly embryo: Embryo | null;
}

export interface EmbryoLifeHistory {
  readonly embryo: Embryo;
  readonly oocyte: Oocyte | undefined;
  readonly checks: readonly FertilisationCheck[];
  readonly gradings: readonly GradingEntry[];
  readonly dispositions: readonly Disposition[];
  /** Media lots applied to this embryo or its originating oocyte. */
  readonly media: readonly MediaApplication[];
}

const witnessKey = (cycleId: string, stepKey: string, sampleId: string): string => `${cycleId}:${stepKey}:${sampleId}`;

/**
 * Embryology lab service. Records oocytes, insemination/ICSI, fertilisation
 * checks, culture grading, dispositions and transfers — each audited and
 * event-emitting. Gamete/embryo handling events are registered with the
 * WitnessPort for reconciliation against RI Witness; the terminal acts
 * (disposition, transfer) are BLOCKED unless the cycle reconciles cleanly. The
 * lab never witnesses here — RI Witness is authoritative.
 */
export class EmbryologyService {
  constructor(
    private readonly store: EmbryologyStore,
    private readonly witness: WitnessPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async recordOocyte(actorId: string, input: RecordOocyteInput): Promise<Oocyte> {
    const oocyte: Oocyte = {
      id: newId<"Oocyte">(),
      cycleId: input.cycleId,
      retrievalProcedureId: input.retrievalProcedureId,
      maturity: input.maturity,
      dish: input.dish,
      position: input.position,
      recordedBy: actorId,
    };
    await this.store.saveOocyte(oocyte);
    await this.audit.record({ actorId, entityType: "Oocyte", entityId: oocyte.id, action: "CREATE", after: { cycleId: input.cycleId, maturity: input.maturity } });
    await this.events.emit({ type: "OocyteRecorded", aggregateType: "Cycle", aggregateId: input.cycleId, data: { maturity: input.maturity } });
    return oocyte;
  }

  /** Insemination/ICSI — a mandatory two-person handling event. Recorded here;
   *  witnessed in RI Witness and reconciled via the WitnessPort. */
  async recordInsemination(actorId: string, input: RecordInseminationInput): Promise<Insemination> {
    const key = witnessKey(input.cycleId, "insemination", String(input.oocyteId));
    const rec: Insemination = {
      id: newId<"Insemination">(),
      cycleId: input.cycleId,
      oocyteId: input.oocyteId as OocyteId,
      method: input.method,
      spermSourceId: input.spermSourceId,
      operator: input.operator,
      inseminatedAt: input.inseminatedAt,
      witnessKey: key,
    };
    await this.store.saveInsemination(rec);
    await this.witness.registerHandlingEvent(actorId, {
      cycleId: input.cycleId,
      stepKey: "insemination",
      oxfordKey: key,
      patientId: input.patientId,
      sampleId: String(input.oocyteId),
      occurredAt: input.inseminatedAt,
    });
    await this.audit.record({ actorId, entityType: "Insemination", entityId: rec.id, action: "CREATE", after: { method: input.method, oocyteId: String(input.oocyteId) } });
    await this.events.emit({ type: "InseminationRecorded", aggregateType: "Cycle", aggregateId: input.cycleId, data: { method: input.method } });
    return rec;
  }

  /** Fertilisation check (2PN/1PN/3PN/0PN). A 2PN check creates a culture embryo. */
  async recordFertilisationCheck(actorId: string, input: RecordCheckInput): Promise<CheckResult> {
    const check: FertilisationCheck = {
      id: newId<"FertilisationCheck">(),
      oocyteId: input.oocyteId as OocyteId,
      cycleId: input.cycleId,
      pn: input.pn,
      checkedAt: input.checkedAt,
      recordedBy: actorId,
    };
    await this.store.saveFertilisationCheck(check);
    let embryo: Embryo | null = null;
    if (yieldsEmbryo(input.pn)) {
      embryo = { id: newId<"Embryo">(), cycleId: input.cycleId, oocyteId: input.oocyteId as OocyteId, createdAt: input.checkedAt };
      await this.store.saveEmbryo(embryo);
      await this.events.emit({ type: "EmbryoCreated", aggregateType: "Cycle", aggregateId: input.cycleId, data: { embryoId: embryo.id } });
    }
    await this.audit.record({ actorId, entityType: "FertilisationCheck", entityId: check.id, action: "CREATE", after: { pn: input.pn, embryoCreated: embryo !== null } });
    return { check, embryo };
  }

  /** Day-by-day culture grading; Gardner grade validated when supplied. */
  async recordGrading(actorId: string, input: RecordGradingInput): Promise<Result<GradingEntry, AppError>> {
    let gardner = null;
    if (input.gardner !== undefined) {
      const g = makeGardnerGrade(input.gardner.expansion, input.gardner.icm, input.gardner.te);
      if (!g.ok) return err(g.error);
      gardner = g.value;
    }
    const entry: GradingEntry = {
      id: newId<"GradingEntry">(),
      embryoId: input.embryoId as EmbryoId,
      day: input.day,
      morphology: input.morphology,
      gardner,
      recordedBy: actorId,
      assessedAt: input.assessedAt,
    };
    await this.store.saveGrading(entry);
    await this.audit.record({ actorId, entityType: "GradingEntry", entityId: entry.id, action: "CREATE", after: { day: input.day, gardner } });
    return ok(entry);
  }

  /** Record a culture-media (or consumable) lot applied to an embryo/oocyte —
   *  an append-only traceability fact (docs/01 §E4). The lot is referenced by the
   *  inventory's own (itemId, lotNo), so a manufacturer recall maps straight to
   *  the embryos exposed via `mediaRecall`. This records lab reality; it does not
   *  gate on or mutate inventory stock (no cross-module dependency). */
  async recordMediaApplication(actorId: string, input: MediaApplicationInput): Promise<Result<MediaApplication, AppError>> {
    const v = validateMediaApplication(input);
    if (!v.ok) return err(v.error);
    const app: MediaApplication = {
      id: newId<"MediaApplication">(),
      cycleId: input.cycleId,
      embryoId: hasValue(input.embryoId) ? (input.embryoId as EmbryoId) : null,
      oocyteId: hasValue(input.oocyteId) ? (input.oocyteId as OocyteId) : null,
      itemId: input.itemId,
      lotNo: input.lotNo,
      step: input.step,
      quantity: input.quantity,
      appliedAt: input.appliedAt,
      operator: actorId,
    };
    await this.store.saveMediaApplication(app);
    await this.audit.record({ actorId, entityType: "MediaApplication", entityId: app.id, action: "CREATE", after: { itemId: app.itemId, lotNo: app.lotNo, embryoId: app.embryoId, oocyteId: app.oocyteId, step: app.step } });
    await this.events.emit({ type: "MediaApplied", aggregateType: "Cycle", aggregateId: input.cycleId, data: { itemId: app.itemId, lotNo: app.lotNo } });
    return ok(app);
  }

  /** Media-recall reachability: every embryo/oocyte/cycle exposed to a media lot. */
  async mediaRecall(itemId: string, lotNo: string): Promise<RecallReach> {
    const apps = await this.store.mediaApplicationsForLot(itemId, lotNo);
    return recallReachability(itemId, lotNo, apps);
  }

  /** The witnessing gate: a cycle step may be signed off only if every handling
   *  event reconciles `matched` with RI Witness. No override. */
  assertStepSignOff(cycleId: string): Promise<Result<void, AppError>> {
    return this.witness.assertCycleStepSignOff(cycleId);
  }

  /** Terminal embryo disposition (freeze/discard/PGT-biopsy). BLOCKED unless the
   *  cycle's prior handling chain reconciles cleanly with RI Witness. */
  async recordDisposition(actorId: string, input: RecordDispositionInput): Promise<Result<Disposition, AppError>> {
    const gate = await this.witness.assertCycleStepSignOff(input.cycleId);
    if (!gate.ok) return err(gate.error);
    const key = witnessKey(input.cycleId, `disposition.${input.type}`, input.embryoId);
    const disp: Disposition = {
      id: newId<"Disposition">(),
      embryoId: input.embryoId as EmbryoId,
      cycleId: input.cycleId,
      type: input.type,
      occurredAt: input.occurredAt,
      operator: input.operator,
      witnessKey: key,
    };
    await this.store.saveDisposition(disp);
    await this.witness.registerHandlingEvent(actorId, {
      cycleId: input.cycleId,
      stepKey: `disposition.${input.type}`,
      oxfordKey: key,
      patientId: input.patientId,
      sampleId: input.embryoId,
      occurredAt: input.occurredAt,
    });
    await this.audit.record({ actorId, entityType: "Disposition", entityId: disp.id, action: "CREATE", after: { type: input.type, embryoId: input.embryoId } });
    await this.events.emit({ type: "EmbryoDisposed", aggregateType: "Cycle", aggregateId: input.cycleId, data: { type: input.type } });
    return ok(disp);
  }

  /** Embryo transfer record. BLOCKED unless the cycle reconciles cleanly. */
  async recordTransfer(actorId: string, input: RecordTransferInput): Promise<Result<EmbryoTransfer, AppError>> {
    const gate = await this.witness.assertCycleStepSignOff(input.cycleId);
    if (!gate.ok) return err(gate.error);
    const transferId = newId<"EmbryoTransfer">();
    const key = witnessKey(input.cycleId, "transfer", transferId);
    const transfer: EmbryoTransfer = {
      id: transferId,
      cycleId: input.cycleId,
      embryoIds: input.embryoIds.map((e) => e as EmbryoId),
      count: input.embryoIds.length,
      catheter: input.catheter,
      difficulty: input.difficulty,
      ultrasoundGuided: input.ultrasoundGuided,
      procedureRef: input.procedureRef ?? null,
      operator: input.operator,
      transferredAt: input.transferredAt,
      witnessKey: key,
    };
    await this.store.saveTransfer(transfer);
    await this.witness.registerHandlingEvent(actorId, {
      cycleId: input.cycleId,
      stepKey: "transfer",
      oxfordKey: key,
      patientId: input.patientId,
      sampleId: transferId,
      occurredAt: input.transferredAt,
    });
    await this.audit.record({ actorId, entityType: "EmbryoTransfer", entityId: transfer.id, action: "CREATE", after: { count: transfer.count, difficulty: input.difficulty } });
    await this.events.emit({ type: "EmbryoTransferred", aggregateType: "Cycle", aggregateId: input.cycleId, data: { count: transfer.count } });
    return ok(transfer);
  }

  // ---- read side (worklist / history reconstruction) ----
  oocytes(cycleId: string): Promise<readonly Oocyte[]> {
    return this.store.oocytesForCycle(cycleId);
  }
  inseminations(cycleId: string): Promise<readonly Insemination[]> {
    return this.store.inseminationsForCycle(cycleId);
  }
  embryos(cycleId: string): Promise<readonly Embryo[]> {
    return this.store.embryosForCycle(cycleId);
  }
  transfers(cycleId: string): Promise<readonly EmbryoTransfer[]> {
    return this.store.transfersForCycle(cycleId);
  }

  /** Reconstruct an embryo's life history from the lab records. */
  async embryoLifeHistory(embryoId: EmbryoId): Promise<Result<EmbryoLifeHistory, AppError>> {
    const embryo = await this.store.embryoById(embryoId);
    if (embryo === undefined) {
      return err(notFound("embryo not found", "embryology.embryo.not_found"));
    }
    const [oocytes, checks, gradings, dispositions, media] = await Promise.all([
      this.store.oocytesForCycle(embryo.cycleId),
      this.store.checksForCycle(embryo.cycleId),
      this.store.gradingsForEmbryo(embryoId),
      this.store.dispositionsForCycle(embryo.cycleId),
      this.store.mediaApplicationsForCycle(embryo.cycleId),
    ]);
    return ok({
      embryo,
      oocyte: oocytes.find((o) => o.id === embryo.oocyteId),
      checks: checks.filter((c) => c.oocyteId === embryo.oocyteId),
      gradings,
      dispositions: dispositions.filter((d) => d.embryoId === embryoId),
      media: media.filter((m) => m.embryoId === embryoId || (m.oocyteId !== null && m.oocyteId === embryo.oocyteId)),
    });
  }
}
