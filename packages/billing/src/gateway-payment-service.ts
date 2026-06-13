import type { Result, AppError } from "@oxford/core";
import { err, validationError } from "@oxford/core";
import type { InvoiceId, InvoiceTotals, Payment, PaymentMethod } from "./types.js";
import { isPaymentMethod } from "./types.js";
import type { BillingService } from "./billing-service.js";
import type { PaymentGatewayPort } from "./gateway.js";

/**
 * Gateway-backed payments (ADR-0036): take a KNET/card payment (or refund)
 * through the PaymentGatewayPort, then record it on the ledger via BillingService
 * with the gateway's reference. A DECLINED charge records NOTHING (no phantom
 * payment). The billing ledger stays gateway-agnostic; this service is the
 * composition. No cash (the method is validated KNET/card).
 */
export class GatewayPaymentService {
  constructor(
    private readonly billing: BillingService,
    private readonly gateway: PaymentGatewayPort,
  ) {}

  async payInvoice(actorId: string, invoiceId: InvoiceId, amountFils: number, method: PaymentMethod): Promise<Result<{ payment: Payment; totals: InvoiceTotals }, AppError>> {
    if (!isPaymentMethod(method)) return err(validationError("only KNET or card payments are accepted (no cash)", "billing.method_not_allowed"));
    const outcome = await this.gateway.charge({ reference: invoiceId, amountFils, method });
    if (!outcome.captured) return err(validationError(`payment declined: ${outcome.reason}`, "billing.gateway.declined"));
    return this.billing.postPayment(actorId, invoiceId, amountFils, method, outcome.gatewayRef);
  }

  async refundInvoice(actorId: string, invoiceId: InvoiceId, amountFils: number, method: PaymentMethod, reason: string): Promise<Result<{ refund: Payment; totals: InvoiceTotals }, AppError>> {
    if (!isPaymentMethod(method)) return err(validationError("only KNET or card refunds are accepted (no cash)", "billing.method_not_allowed"));
    const outcome = await this.gateway.refund({ reference: invoiceId, amountFils, method });
    if (!outcome.captured) return err(validationError(`refund declined: ${outcome.reason}`, "billing.gateway.declined"));
    return this.billing.refund(actorId, invoiceId, amountFils, method, reason, outcome.gatewayRef);
  }
}
