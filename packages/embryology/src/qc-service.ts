import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { LabQcReading } from "./types.js";
import { evaluateReading, type QcParameterStore } from "./qc.js";
import type { QcReadingFilter, QcReadingStore } from "./qc-store.js";

export interface RecordQcInput {
  readonly parameterCode: string;
  readonly value: number;
  readonly assetRef?: string;
  readonly lotNo?: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly note?: string;
}

/**
 * Lab QC log (docs/01 §E5 P1). Records periodic quality readings (incubator
 * gas/temp, media pH/osmolality) against configured parameters, flags out-of-range
 * readings (a `fail` raises a `LabQcBreached` event), and serves the QC log.
 * Equipment + media lots are referenced by id; the module never reaches across
 * boundaries. Every reading is audited.
 */
export class LabQcService {
  constructor(
    private readonly parameters: QcParameterStore,
    private readonly readings: QcReadingStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  /** Available QC parameters (config) for the entry UI. */
  listParameters(): ReturnType<QcParameterStore["listActive"]> {
    return this.parameters.listActive();
  }

  async record(actorId: string, input: RecordQcInput): Promise<Result<LabQcReading, AppError>> {
    const p = await this.parameters.get(input.parameterCode);
    if (p === null || !p.active) return err(validationError(`unknown or inactive QC parameter '${input.parameterCode}'`, "embryology.qc.unknown_parameter"));
    const { status } = evaluateReading(p, input.value);
    const reading: LabQcReading = {
      id: newId<"LabQcReading">(),
      parameterCode: p.code,
      value: input.value,
      unit: p.unit,
      assetRef: input.assetRef ?? null,
      lotNo: input.lotNo ?? null,
      status,
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt,
      note: input.note ?? null,
    };
    await this.readings.save(reading);
    await this.audit.record({ actorId, entityType: "LabQcReading", entityId: reading.id, action: "CREATE", after: { parameterCode: p.code, value: input.value, status } });
    await this.events.emit({
      type: status === "fail" ? "LabQcBreached" : "LabQcRecorded",
      aggregateType: "LabQcReading",
      aggregateId: reading.id,
      data: { parameterCode: p.code, status, assetRef: reading.assetRef, lotNo: reading.lotNo },
    });
    return ok(reading);
  }

  /** The QC log, filterable by parameter / equipment / lot / time. */
  list(filter: QcReadingFilter): Promise<readonly LabQcReading[]> {
    return this.readings.list(filter);
  }
}
