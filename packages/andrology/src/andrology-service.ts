import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  SemenAnalysis,
  SemenParameters,
  SpermPrep,
  SpermFreeze,
  SurgicalRetrieval,
  PrepMethod,
  RetrievalMethod,
  AdvancedSpermTest,
  AdvancedTestSpec,
} from "./types.js";
import type { AndrologyStore } from "./store.js";
import type { WitnessPort } from "./witness-port.js";
import { validateSemenParameters, flagSemen, allWithinReference, type ReferenceLimits } from "./semen-analysis.js";
import { interpret, InMemoryAdvancedTestSpecStore, type AdvancedTestSpecStore } from "./advanced-tests.js";

export interface RecordAnalysisInput {
  readonly patientId: string;
  readonly collectedAt: string;
  readonly parameters: SemenParameters;
  /** Optional clinic-specific reference limits (defaults to WHO 6th edition). */
  readonly limits?: ReferenceLimits;
}
export interface RecordPrepInput {
  readonly patientId: string;
  readonly method: PrepMethod;
  readonly postPrepConcentrationMillionPerMl: number;
  readonly postPrepProgressiveMotilityPct: number;
  readonly preparedAt: string;
}
export interface RecordFreezeInput {
  readonly cycleId: string;
  readonly patientId: string;
  readonly cryoSpecimenRef: string;
  readonly straws: number;
  readonly frozenAt: string;
}
export interface RecordRetrievalInput {
  readonly patientId: string;
  readonly method: RetrievalMethod;
  readonly theatreBookingRef: string;
  readonly spermFound: boolean;
  readonly performedAt: string;
}
export interface RecordAdvancedTestInput {
  readonly patientId: string;
  readonly code: string;
  readonly value: number;
  readonly method?: string;
  readonly performedAt: string;
  readonly note?: string;
}

/**
 * Andrology lab service. Semen analysis is flagged against WHO 6th-edition
 * reference values; sperm preparation and surgical retrieval are recorded; a
 * sperm freeze is a WITNESSED handling event (registered with the WitnessPort
 * for reconciliation against RI Witness) carrying a cryostore link. The lab
 * never witnesses — RI Witness is authoritative.
 */
export class AndrologyService {
  constructor(
    private readonly store: AndrologyStore,
    private readonly witness: WitnessPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly advancedSpecs: AdvancedTestSpecStore = new InMemoryAdvancedTestSpecStore(),
  ) {}

  /** Available advanced sperm test specs (config) for the entry UI. */
  listAdvancedTestSpecs(): Promise<readonly AdvancedTestSpec[]> {
    return this.advancedSpecs.listActive();
  }

  /** Record an advanced sperm test (e.g. DNA fragmentation), interpreting the value
   *  against its configured spec. An `abnormal` result emits a flag event. */
  async recordAdvancedTest(actorId: string, input: RecordAdvancedTestInput): Promise<Result<AdvancedSpermTest, AppError>> {
    const spec = await this.advancedSpecs.get(input.code);
    if (spec === null || !spec.active) return err(validationError(`unknown or inactive advanced sperm test '${input.code}'`, "andrology.advanced_test.unknown"));
    const interpretation = interpret(spec, input.value);
    const test: AdvancedSpermTest = {
      id: newId<"AdvancedSpermTest">(),
      patientId: input.patientId,
      code: spec.code,
      value: input.value,
      unit: spec.unit,
      interpretation,
      method: input.method ?? null,
      performedBy: actorId,
      performedAt: input.performedAt,
      note: input.note ?? null,
    };
    await this.store.saveAdvancedTest(test);
    await this.audit.record({ actorId, entityType: "AdvancedSpermTest", entityId: test.id, action: "CREATE", after: { code: spec.code, value: input.value, interpretation } });
    await this.events.emit({
      type: interpretation === "abnormal" ? "AdvancedSpermTestAbnormal" : "AdvancedSpermTestRecorded",
      aggregateType: "Patient",
      aggregateId: input.patientId,
      data: { code: spec.code, interpretation },
    });
    return ok(test);
  }

  /** A patient's advanced sperm test history. */
  advancedTests(patientId: string): Promise<readonly AdvancedSpermTest[]> {
    return this.store.advancedTestsForPatient(patientId);
  }

  async recordSemenAnalysis(actorId: string, input: RecordAnalysisInput): Promise<Result<SemenAnalysis, AppError>> {
    const valid = validateSemenParameters(input.parameters);
    if (!valid.ok) return err(valid.error);
    const flags = flagSemen(input.parameters, input.limits);
    const analysis: SemenAnalysis = {
      id: newId<"SemenAnalysis">(),
      patientId: input.patientId,
      collectedAt: input.collectedAt,
      parameters: input.parameters,
      flags,
      allWithinReference: allWithinReference(flags),
      recordedBy: actorId,
    };
    await this.store.saveAnalysis(analysis);
    await this.audit.record({ actorId, entityType: "SemenAnalysis", entityId: analysis.id, action: "CREATE", after: { allWithinReference: analysis.allWithinReference } });
    await this.events.emit({ type: "SemenAnalysisRecorded", aggregateType: "Patient", aggregateId: input.patientId, data: { allWithinReference: analysis.allWithinReference } });
    return ok(analysis);
  }

  async recordPrep(actorId: string, input: RecordPrepInput): Promise<SpermPrep> {
    const prep: SpermPrep = {
      id: newId<"SpermPrep">(),
      patientId: input.patientId,
      method: input.method,
      postPrepConcentrationMillionPerMl: input.postPrepConcentrationMillionPerMl,
      postPrepProgressiveMotilityPct: input.postPrepProgressiveMotilityPct,
      preparedBy: actorId,
      preparedAt: input.preparedAt,
    };
    await this.store.savePrep(prep);
    await this.audit.record({ actorId, entityType: "SpermPrep", entityId: prep.id, action: "CREATE", after: { method: input.method } });
    await this.events.emit({ type: "SpermPrepRecorded", aggregateType: "Patient", aggregateId: input.patientId, data: { method: input.method } });
    return prep;
  }

  /** Witnessed sperm freeze with a cryostore link. Registers the handling event
   *  for reconciliation against RI Witness. */
  async recordFreeze(actorId: string, input: RecordFreezeInput): Promise<SpermFreeze> {
    const witnessKey = `${input.cycleId}:freeze.sperm:${input.cryoSpecimenRef}`;
    const freeze: SpermFreeze = {
      id: newId<"SpermFreeze">(),
      patientId: input.patientId,
      cryoSpecimenRef: input.cryoSpecimenRef,
      straws: input.straws,
      frozenBy: actorId,
      frozenAt: input.frozenAt,
      witnessKey,
    };
    await this.store.saveFreeze(freeze);
    await this.witness.registerHandlingEvent(actorId, {
      cycleId: input.cycleId,
      stepKey: "freeze.sperm",
      oxfordKey: witnessKey,
      patientId: input.patientId,
      sampleId: input.cryoSpecimenRef,
      occurredAt: input.frozenAt,
    });
    await this.audit.record({ actorId, entityType: "SpermFreeze", entityId: freeze.id, action: "CREATE", after: { cryoSpecimenRef: input.cryoSpecimenRef, straws: input.straws } });
    await this.events.emit({ type: "SpermFrozen", aggregateType: "Patient", aggregateId: input.patientId, data: { straws: input.straws } });
    return freeze;
  }

  async recordSurgicalRetrieval(actorId: string, input: RecordRetrievalInput): Promise<SurgicalRetrieval> {
    const retrieval: SurgicalRetrieval = {
      id: newId<"SurgicalRetrieval">(),
      patientId: input.patientId,
      method: input.method,
      theatreBookingRef: input.theatreBookingRef,
      spermFound: input.spermFound,
      performedBy: actorId,
      performedAt: input.performedAt,
    };
    await this.store.saveRetrieval(retrieval);
    await this.audit.record({ actorId, entityType: "SurgicalRetrieval", entityId: retrieval.id, action: "CREATE", after: { method: input.method, spermFound: input.spermFound } });
    await this.events.emit({ type: "SurgicalRetrievalRecorded", aggregateType: "Patient", aggregateId: input.patientId, data: { method: input.method, spermFound: input.spermFound } });
    return retrieval;
  }

  // ---- read side ----
  analyses(patientId: string): Promise<readonly SemenAnalysis[]> {
    return this.store.analysesForPatient(patientId);
  }
  preps(patientId: string): Promise<readonly SpermPrep[]> {
    return this.store.prepsForPatient(patientId);
  }
  freezes(patientId: string): Promise<readonly SpermFreeze[]> {
    return this.store.freezesForPatient(patientId);
  }
  retrievals(patientId: string): Promise<readonly SurgicalRetrieval[]> {
    return this.store.retrievalsForPatient(patientId);
  }
}
