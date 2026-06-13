import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertAmount, balance, lineTotal, subtotal } from "./money.js";
import type { Invoice, InvoiceId, InvoiceLine, InvoiceTotals, Payment, PaymentMethod } from "./types.js";
import { isPaymentMethod } from "./types.js";
import type { BillingStore } from "./store.js";

/**
 * Invoicing & payments. All money is integer fils (no float drift); NO TAX
 * (ADR-0035) — total = subtotal. NO CASH (ADR-0034) — only KNET/card; the method
 * is validated at runtime so a "cash" string from the untyped API boundary is
 * rejected. Every mutation is audited; payment posting rejects bad amounts and
 * overpayment and flips the invoice to paid at zero balance; refunds are
 * append-only ledger entries (never deletes) and reopen a paid invoice.
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
  ): Promise<Result<Invoice, AppError>> {
    if (lines.length === 0) return err(validationError("an invoice needs at least one line", "billing.empty_invoice"));
    for (const line of lines) {
      const amt = assertAmount(line.unitAmountFils);
      if (!amt.ok) return err(amt.error);
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        return err(validationError("quantity must be a positive integer", "billing.bad_quantity"));
      }
    }
    const invoice: Invoice = {
      id: newId<"Invoice">(),
      patientId,
      currency: "KWD",
      lines,
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
    const total = subtotal(invoice.lines.map((l) => lineTotal(l.unitAmountFils, l.quantity))); // no tax: total = subtotal
    const payments = await this.store.paymentsFor(invoice.id);
    // paid is NET of refunds (a refund is money out).
    const paid = payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amountFils : p.amountFils), 0);
    return { subtotalFils: total, totalFils: total, paidFils: paid, balanceFils: balance(total, paid) };
  }

  /** Record a payment. Rejects bad amounts and overpayment; marks paid at zero balance. */
  async postPayment(
    actorId: string,
    invoiceId: InvoiceId,
    amountFils: number,
    method: PaymentMethod,
    gatewayRef = "",
  ): Promise<Result<{ payment: Payment; totals: InvoiceTotals }, AppError>> {
    const amt = assertAmount(amountFils);
    if (!amt.ok) return err(amt.error);
    if (amountFils === 0) return err(validationError("payment must be greater than zero", "billing.zero_payment"));
    if (!isPaymentMethod(method)) return err(validationError("only KNET or card payments are accepted (no cash)", "billing.method_not_allowed"));

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
      kind: "payment",
      amountFils,
      method,
      takenBy: actorId,
      receiptNo: `RCPT-${newId<"Payment">().slice(0, 8)}`,
      reason: "",
      gatewayRef,
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

  /** Refund (money out) — an append-only ledger entry, never a delete. Cannot
   *  exceed the net amount paid; reopens a paid invoice when the balance returns
   *  above zero. KNET/card only (no cash). */
  async refund(
    actorId: string,
    invoiceId: InvoiceId,
    amountFils: number,
    method: PaymentMethod,
    reason: string,
    gatewayRef = "",
  ): Promise<Result<{ refund: Payment; totals: InvoiceTotals }, AppError>> {
    const amt = assertAmount(amountFils);
    if (!amt.ok) return err(amt.error);
    if (amountFils === 0) return err(validationError("refund must be greater than zero", "billing.zero_refund"));
    if (!isPaymentMethod(method)) return err(validationError("only KNET or card refunds are accepted (no cash)", "billing.method_not_allowed"));

    const invoice = await this.store.getInvoice(invoiceId);
    if (invoice === null) return err(notFound("invoice not found", "billing.invoice.not_found"));

    const before = await this.computeTotals(invoice);
    if (amountFils > before.paidFils) {
      return err(validationError("refund exceeds the amount paid", "billing.refund_exceeds_paid"));
    }

    const refund: Payment = {
      id: newId<"Payment">(),
      invoiceId,
      kind: "refund",
      amountFils,
      method,
      takenBy: actorId,
      receiptNo: `RFND-${newId<"Payment">().slice(0, 8)}`,
      reason,
      gatewayRef,
      at: this.clock.now().toISOString(),
    };
    await this.store.savePayment(refund);

    const totals = await this.computeTotals(invoice);
    // a refund that reopens the balance flips a paid invoice back to open
    if (totals.balanceFils > 0 && invoice.status === "paid") {
      await this.store.saveInvoice({ ...invoice, status: "open" });
    }
    await this.audit.record({ actorId, entityType: "Payment", entityId: refund.id, action: "CREATE", after: { invoiceId, refundFils: amountFils, method, reason } });
    await this.events.emit({ type: "RefundIssued", aggregateType: "Invoice", aggregateId: invoiceId, data: { amountFils, balanceFils: totals.balanceFils } });
    return ok({ refund, totals });
  }
}
