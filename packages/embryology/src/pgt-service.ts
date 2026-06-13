import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { EmbryoId, PgtOrder, PgtOrderId, PgtResult, PgtResultStatus, PgtType } from "./types.js";
import type { PgtStore } from "./store.js";
import { assertPgtIndicationPermitted } from "./pgt.js";

export interface OrderPgtInput {
  readonly embryoId: string;
  readonly cycleId: string;
  readonly type: PgtType;
  readonly indication: string;
  readonly consentDocumentRef: string;
  readonly orderedAt: string;
}
export interface RecordPgtResultInput {
  readonly orderId: string;
  readonly embryoId: string;
  readonly status: PgtResultStatus;
  readonly reportRef: string;
  readonly resolvedAt: string;
}

/**
 * PGT order/consent/result capture (the genetics lab itself stays external). An
 * order requires a captured consent AND an indication in the clinic's
 * counsel-confirmed permitted set (config; empty by default → orders blocked
 * until configured). Results from the external lab are recorded against the order.
 */
export class PgtService {
  constructor(
    private readonly store: PgtStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    /** Clinic-configured, counsel-confirmed permitted indications (config-as-data). */
    private readonly permittedIndications: readonly string[],
  ) {}

  async orderPgt(actorId: string, input: OrderPgtInput): Promise<Result<PgtOrder, AppError>> {
    if (input.consentDocumentRef.trim() === "") {
      return err(validationError("PGT requires a captured consent", "embryology.pgt.consent_required"));
    }
    const permitted = assertPgtIndicationPermitted(input.indication, this.permittedIndications);
    if (!permitted.ok) return err(permitted.error);
    const order: PgtOrder = {
      id: newId<"PgtOrder">(),
      embryoId: input.embryoId as EmbryoId,
      cycleId: input.cycleId,
      type: input.type,
      indication: input.indication,
      consentDocumentRef: input.consentDocumentRef,
      orderedBy: actorId,
      orderedAt: input.orderedAt,
    };
    await this.store.saveOrder(order);
    await this.audit.record({ actorId, entityType: "PgtOrder", entityId: order.id, action: "CREATE", after: { type: input.type, indication: input.indication, embryoId: input.embryoId } });
    await this.events.emit({ type: "PgtOrdered", aggregateType: "Cycle", aggregateId: input.cycleId, data: { type: input.type } });
    return ok(order);
  }

  async recordPgtResult(actorId: string, input: RecordPgtResultInput): Promise<PgtResult> {
    const result: PgtResult = {
      id: newId<"PgtResult">(),
      orderId: input.orderId as PgtOrderId,
      embryoId: input.embryoId as EmbryoId,
      status: input.status,
      reportRef: input.reportRef,
      resolvedAt: input.resolvedAt,
      recordedBy: actorId,
    };
    await this.store.saveResult(result);
    await this.audit.record({ actorId, entityType: "PgtResult", entityId: result.id, action: "CREATE", after: { status: input.status, orderId: input.orderId } });
    await this.events.emit({ type: "PgtResultRecorded", aggregateType: "Cycle", aggregateId: input.embryoId, data: { status: input.status } });
    return result;
  }

  orders(cycleId: string): Promise<readonly PgtOrder[]> {
    return this.store.ordersForCycle(cycleId);
  }
  resultFor(orderId: PgtOrderId): Promise<PgtResult | undefined> {
    return this.store.resultForOrder(orderId);
  }
}
