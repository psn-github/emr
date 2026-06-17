import type { Result, AppError } from "@oxford/core";
import { ok, err, newId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { ConsumableUse, DrugAdministration, IntraOpRecord, SpecimenRecord } from "./types.js";
import type { IntraOpStore } from "./intraop-store.js";
import type { InventoryPort, PerioperativeBillingPort } from "./ports.js";
import { validateDrugAdministration, type AnaesthesiaUnit, type FormularyDrug, ANAESTHESIA_FORMULARY } from "./anaesthesia.js";
import { validateConsumableUse, type ConsumableUseInput } from "./consumables.js";

export interface RecordIntraOpInput {
  readonly encounterId: string;
  readonly procedurePerformed: string;
  readonly findings: string;
  readonly anaestheticTechnique: string;
  readonly drugs: readonly { formularyCode: string; dose: number; unit: AnaesthesiaUnit }[];
  readonly staff: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string;
}
export interface RecordSpecimenInput {
  readonly encounterId: string;
  readonly type: string;
  readonly site: string;
  readonly lotRef: string;
  readonly collectedAt: string;
}
export interface ConsumablesResult {
  readonly invoiceRef: string;
  readonly consumables: readonly ConsumableUse[];
}

/**
 * Intra-operative + anaesthesia record, plus consumables/implants capture and
 * specimen traceability. Anaesthetic drugs come from the controlled formulary
 * (no free text). Consumables deduct from stock (InventoryPort) and bill via the
 * billing seam; every consumable carries a lot/serial; specimens are captured
 * with their source + lot.
 */
export class IntraOpService {
  constructor(
    private readonly store: IntraOpStore,
    private readonly inventory: InventoryPort,
    private readonly billing: PerioperativeBillingPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly formulary: readonly FormularyDrug[] = ANAESTHESIA_FORMULARY,
  ) {}

  async recordIntraOp(actorId: string, input: RecordIntraOpInput): Promise<Result<IntraOpRecord, AppError>> {
    for (const drug of input.drugs) {
      const valid = validateDrugAdministration(drug, this.formulary);
      if (!valid.ok) return err(valid.error);
    }
    const record: IntraOpRecord = {
      id: newId<"IntraOpRecord">(),
      encounterId: input.encounterId,
      procedurePerformed: input.procedurePerformed,
      findings: input.findings,
      anaestheticTechnique: input.anaestheticTechnique,
      drugs: input.drugs as readonly DrugAdministration[],
      staff: input.staff,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      recordedBy: actorId,
    };
    await this.store.saveRecord(record);
    await this.audit.record({ actorId, entityType: "IntraOpRecord", entityId: record.id, action: "CREATE", after: { encounterId: input.encounterId, procedure: input.procedurePerformed } });
    await this.events.emit({ type: "IntraOpRecorded", aggregateType: "SurgicalEncounter", aggregateId: input.encounterId, data: { procedure: input.procedurePerformed } });
    return ok(record);
  }

  /** Capture consumables/implants at point of use → deduct stock + bill. */
  async recordConsumables(actorId: string, encounterId: string, patientId: string, uses: readonly ConsumableUseInput[], recordedAt: string): Promise<Result<ConsumablesResult, AppError>> {
    for (const use of uses) {
      const valid = validateConsumableUse(use);
      if (!valid.ok) return err(valid.error);
    }
    const deducted = await this.inventory.deduct(actorId, uses.map((u) => ({ code: u.code, lotNo: u.lotNo, quantity: u.quantity })));
    if (!deducted.ok) return err(deducted.error);

    const invoiceRef = await this.billing.raiseConsumableCharges(
      actorId,
      patientId,
      uses.map((u) => ({ chargeCode: u.code, descriptionEn: u.description, descriptionAr: u.description, unitAmountFils: u.unitPriceFils, quantity: u.quantity })),
    );

    const saved: ConsumableUse[] = [];
    for (const u of uses) {
      const rec: ConsumableUse = {
        id: newId<"ConsumableUse">(),
        encounterId,
        patientId,
        code: u.code,
        description: u.description,
        lotNo: u.lotNo,
        quantity: u.quantity,
        unitPriceFils: u.unitPriceFils,
        invoiceRef,
        recordedBy: actorId,
        recordedAt,
      };
      await this.store.saveConsumable(rec);
      saved.push(rec);
    }
    await this.audit.record({ actorId, entityType: "ConsumableUse", entityId: encounterId, action: "CREATE", after: { count: uses.length, invoiceRef } });
    await this.events.emit({ type: "ConsumablesRecorded", aggregateType: "SurgicalEncounter", aggregateId: encounterId, data: { count: uses.length } });
    return ok({ invoiceRef, consumables: saved });
  }

  async recordSpecimen(actorId: string, input: RecordSpecimenInput): Promise<SpecimenRecord> {
    const specimen: SpecimenRecord = {
      id: newId<"SpecimenRecord">(),
      encounterId: input.encounterId,
      type: input.type,
      site: input.site,
      lotRef: input.lotRef,
      collectedAt: input.collectedAt,
      recordedBy: actorId,
    };
    await this.store.saveSpecimen(specimen);
    await this.audit.record({ actorId, entityType: "SpecimenRecord", entityId: specimen.id, action: "CREATE", after: { type: input.type, lotRef: input.lotRef } });
    await this.events.emit({ type: "SpecimenCaptured", aggregateType: "SurgicalEncounter", aggregateId: input.encounterId, data: { type: input.type } });
    return specimen;
  }

  intraOp(encounterId: string): Promise<IntraOpRecord | undefined> {
    return this.store.recordForEncounter(encounterId);
  }
  consumables(encounterId: string): Promise<readonly ConsumableUse[]> {
    return this.store.consumablesForEncounter(encounterId);
  }
  specimens(encounterId: string): Promise<readonly SpecimenRecord[]> {
    return this.store.specimensForEncounter(encounterId);
  }
}
