import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertAmount, balance, invoiceTotal, lineTotal, subtotal, taxAmount } from "./money.js";
import type { Invoice, InvoiceId, InvoiceLine, InvoiceTotals, Payment, PaymentMethod } from "./types.js";
import type { BillingStore } from "./store.js";

/**
 * Basic invoicing & payments. All money is integer fils (no float drift). Every
 * mutation is audited; payment posting rejects bad amounts and overpayment, and
 * flips the invoice to paid when the balance reaches zero. Charge/void/refund,
 * packages and instalments are Phase 5. RBAC (financial domain) is at the API.
 */
export class BillingService {
  constructor(
    private readonly store: BillingStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async createInvoice(
    actorId: string,
    patientId: string,
    lines: readonly InvoiceLine[],
    taxRateBps = 0,
  ): Promise<Result<Invoice, AppError>> {
    if (lines.length === 0) return err(validationError("an invoice needs at least one line", "billing.empty_invoice"));
    for (const line of lines) {
      const amt = assertAmount(line.unitAmountFils);
      if (!amt.ok) return err(amt.error);
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        return err(validationError("quantity must be a positive integer", "billing.bad_quantity"));
      }
    }
    if (!Number.isInteger(taxRateBps) || taxRateBps < 0) {
      return err(validationError("tax rate must be a non-negative integer (bps)", "billing.bad_tax_rate"));
    }
    const invoice: Invoice = {
      id: newId<"Invoice">(),
      patientId,
      currency: "KWD",
      lines,
      taxRateBps,
      status: "open",
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.saveInvoice(invoice);
    await this.audit.record({ actorId, entityType: "Invoice", entityId: invoice.id, action: "CREATE", after: { patientId, lineCount: lines.length } });
    await this.events.emit({ type: "InvoiceCreated", aggregateType: "Invoice", aggregateId: invoice.id, data: { patientId } });
    return ok(invoice);
  }

  /** Computed money view (subtotal/tax/total/paid/balance). */
  async totals(invoiceId: InvoiceId): Promise<Result<InvoiceTotals, AppError>> {
    const invoice = await this.store.getInvoice(invoiceId);
    if (invoice === null) return err(notFound("invoice not found", "billing.invoice.not_found"));
    return ok(await this.computeTotals(invoice));
  }

  private async computeTotals(invoice: Invoice): Promise<InvoiceTotals> {
    const sub = subtotal(invoice.lines.map((l) => lineTotal(l.unitAmountFils, l.quantity)));
    const tax = taxAmount(sub, invoice.taxRateBps);
    const total = invoiceTotal(sub, tax);
    const payments = await this.store.paymentsFor(invoice.id);
    const paid = payments.reduce((s, p) => s + p.amountFils, 0);
    return { subtotalFils: sub, taxFils: tax, totalFils: total, paidFils: paid, balanceFils: balance(total, paid) };
  }

  /** Record a payment. Rejects bad amounts and overpayment; marks paid at zero balance. */
  async postPayment(
    actorId: string,
    invoiceId: InvoiceId,
    amountFils: number,
    method: PaymentMethod,
  ): Promise<Result<{ payment: Payment; totals: InvoiceTotals }, AppError>> {
    const amt = assertAmount(amountFils);
    if (!amt.ok) return err(amt.error);
    if (amountFils === 0) return err(validationError("payment must be greater than zero", "billing.zero_payment"));

    const invoice = await this.store.getInvoice(invoiceId);
    if (invoice === null) return err(notFound("invoice not found", "billing.invoice.not_found"));
    if (invoice.status === "paid") return err(validationError("invoice is already paid", "billing.already_paid"));

    const before = await this.computeTotals(invoice);
    if (amountFils > before.balanceFils) {
      return err(validationError("payment exceeds the outstanding balance", "billing.overpayment"));
    }

    const payment: Payment = {
      id: newId<"Payment">(),
      invoiceId,
      amountFils,
      method,
      takenBy: actorId,
      receiptNo: `RCPT-${newId<"Payment">().slice(0, 8)}`,
      at: this.clock.now().toISOString(),
    };
    await this.store.savePayment(payment);

    const totals = await this.computeTotals(invoice);
    if (totals.balanceFils === 0) {
      await this.store.saveInvoice({ ...invoice, status: "paid" });
    }
    await this.audit.record({ actorId, entityType: "Payment", entityId: payment.id, action: "CREATE", after: { invoiceId, amountFils, method } });
    await this.events.emit({ type: "PaymentPosted", aggregateType: "Invoice", aggregateId: invoiceId, data: { amountFils, balanceFils: totals.balanceFils } });
    return ok({ payment, totals });
  }
}
