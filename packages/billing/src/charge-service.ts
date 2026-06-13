import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { BilingualText, Charge, ChargeMasterItem, ChargeSource } from "./types.js";
import { isValidAmount } from "./money.js";
import type { ChargeMasterStore, ChargeStore } from "./charge-store.js";
import type { PackageService } from "./package-service.js";
import type { BillingService } from "./billing-service.js";

export interface DefineChargeInput {
  readonly code: string;
  readonly description: BilingualText;
  readonly unitAmountFils: number;
}
export interface CaptureChargeInput {
  readonly patientId: string;
  readonly chargeCode: string;
  readonly quantity: number;
  readonly source: ChargeSource;
  readonly occurredAt: string;
  /** When set, the charge is first recognised against the patient's package. */
  readonly patientPackageId?: string;
}
export interface CaptureResult {
  readonly recognisedQuantity: number;
  readonly billableQuantity: number;
  readonly billableAmountFils: number;
}

/**
 * Item-level charge capture (docs/01 §E11). Charges are priced from the CHARGE
 * MASTER — no free-text charges (formulary discipline). A capture from a
 * clinical/lab/theatre/pharmacy event is first recognised against the patient's
 * package inclusion (consuming it; the recognised part is recorded but not
 * separately billable); the remainder is a billable charge. Billable charges are
 * later batched into an invoice (`invoicePatient`). Money is integer fils, 100%.
 */
export class ChargeCaptureService {
  constructor(
    private readonly master: ChargeMasterStore,
    private readonly charges: ChargeStore,
    private readonly packages: PackageService,
    private readonly billing: BillingService,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  /** Define a priceable charge code (config; no free-text charges). */
  async defineChargeCode(actorId: string, input: DefineChargeInput): Promise<Result<ChargeMasterItem, AppError>> {
    if (input.code.trim() === "") return err(validationError("charge code is required", "billing.charge.code_required"));
    if (input.description.en.trim() === "" || input.description.ar.trim() === "") return err(validationError("charge description (en + ar) is required", "billing.charge.description_required"));
    if (!isValidAmount(input.unitAmountFils)) return err(validationError("unit amount must be a non-negative integer (fils)", "billing.bad_amount"));
    const item: ChargeMasterItem = { code: input.code, description: input.description, unitAmountFils: input.unitAmountFils, active: true };
    await this.master.saveItem(item);
    await this.audit.record({ actorId, entityType: "ChargeMasterItem", entityId: item.code, action: "CREATE", after: { code: item.code, unitAmountFils: item.unitAmountFils } });
    return ok(item);
  }

  /** Capture a delivered charge from a domain event. Prices from the master;
   *  recognises against a package when given; records recognised + billable rows. */
  async capture(actorId: string, input: CaptureChargeInput): Promise<Result<CaptureResult, AppError>> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) return err(validationError("quantity must be a positive whole number", "billing.bad_quantity"));
    const item = await this.master.getItem(input.chargeCode);
    if (item === null || !item.active) return err(notFound("charge code not in the charge master", "billing.charge.code_unknown"));

    let recognisedQty = 0;
    let billableQty = input.quantity;
    if (input.patientPackageId !== undefined) {
      const r = await this.packages.captureCharge(actorId, input.patientPackageId, input.chargeCode, input.quantity);
      if (!r.ok) return err(r.error);
      recognisedQty = r.value.consumed;
      billableQty = r.value.extra;
    }

    if (recognisedQty > 0) {
      await this.record(actorId, input, item, recognisedQty, true);
    }
    if (billableQty > 0) {
      await this.record(actorId, input, item, billableQty, false);
    }
    await this.events.emit({ type: "ChargeCaptured", aggregateType: "Patient", aggregateId: input.patientId, data: { chargeCode: input.chargeCode, billableQty } });
    return ok({ recognisedQuantity: recognisedQty, billableQuantity: billableQty, billableAmountFils: billableQty * item.unitAmountFils });
  }

  /** Roll a patient's uninvoiced billable charges into a single invoice. */
  async invoicePatient(actorId: string, patientId: string): Promise<Result<{ invoiceId: string; lineCount: number }, AppError>> {
    const pending = await this.charges.uninvoicedBillableForPatient(patientId);
    if (pending.length === 0) return err(validationError("no billable charges to invoice", "billing.charge.nothing_to_invoice"));
    const inv = await this.billing.createInvoice(actorId, patientId, pending.map((c) => ({ chargeCode: c.chargeCode, description: c.description, unitAmountFils: c.unitAmountFils, quantity: c.quantity })));
    if (!inv.ok) return err(inv.error);
    for (const c of pending) {
      await this.charges.saveCharge({ ...c, invoiceId: inv.value.id });
    }
    await this.audit.record({ actorId, entityType: "Invoice", entityId: inv.value.id, action: "UPDATE", after: { patientId, fromCharges: pending.length } });
    return ok({ invoiceId: inv.value.id, lineCount: pending.length });
  }

  chargesForPatient(patientId: string): Promise<readonly Charge[]> {
    return this.charges.chargesForPatient(patientId);
  }
  /** Revenue rows (one per invoiced charge) for the revenue-by-line dashboard. */
  async revenueRows(): Promise<readonly { line: string; amountFils: number }[]> {
    const charges = await this.charges.invoicedCharges();
    return charges.map((c) => ({ line: c.source, amountFils: c.quantity * c.unitAmountFils }));
  }
  listChargeCodes(): Promise<readonly ChargeMasterItem[]> {
    return this.master.items();
  }

  private async record(actorId: string, input: CaptureChargeInput, item: ChargeMasterItem, quantity: number, recognised: boolean): Promise<void> {
    const charge: Charge = {
      id: newId<"Charge">(),
      patientId: input.patientId,
      chargeCode: input.chargeCode,
      description: item.description,
      quantity,
      unitAmountFils: item.unitAmountFils,
      source: input.source,
      occurredAt: input.occurredAt,
      recognised,
      patientPackageId: input.patientPackageId ?? null,
      invoiceId: null,
    };
    await this.charges.saveCharge(charge);
    await this.audit.record({ actorId, entityType: "Charge", entityId: charge.id, action: "CREATE", after: { chargeCode: charge.chargeCode, quantity, recognised, source: input.source } });
  }
}
