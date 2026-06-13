import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { StubPaymentGateway } from "./gateway.js";
import { GatewayPaymentService } from "./gateway-payment-service.js";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import type { InvoiceId, PaymentMethod } from "./types.js";

describe("StubPaymentGateway", () => {
  it("captures KNET/card charges and refunds with a synthetic ref; can be forced to decline", async () => {
    const gw = new StubPaymentGateway();
    const c1 = await gw.charge({ reference: "inv-1", amountFils: 1000, method: "knet" });
    expect(c1.captured && c1.gatewayRef.startsWith("CHG-KNET-")).toBe(true);
    const r1 = await gw.refund({ reference: "inv-1", amountFils: 500, method: "card" });
    expect(r1.captured && r1.gatewayRef.startsWith("RFND-CARD-")).toBe(true);
    gw.declineNext();
    const declined = await gw.charge({ reference: "inv-1", amountFils: 1000, method: "card" });
    expect(declined.captured).toBe(false);
    if (!declined.captured) expect(declined.reason).toBe("stub_declined");
    // decline is one-shot — the next charge captures again
    expect((await gw.charge({ reference: "inv-1", amountFils: 1000, method: "knet" })).captured).toBe(true);
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const billing = new BillingService(new InMemoryBillingStore(), audit, events, clock);
  const gateway = new StubPaymentGateway();
  const svc = new GatewayPaymentService(billing, gateway);
  return { svc, billing, gateway };
}
async function invoiced(billing: BillingService): Promise<InvoiceId> {
  const r = await billing.createInvoice("fin-1", "pat-1", [{ chargeCode: "C", description: { ar: "C", en: "C" }, unitAmountFils: 10000, quantity: 1 }]);
  if (!r.ok) throw new Error("setup");
  return r.value.id;
}

describe("GatewayPaymentService", () => {
  it("records a captured payment with the gateway ref; a decline records nothing", async () => {
    const { svc, billing, gateway } = build();
    const invoiceId = await invoiced(billing);

    const pay = await svc.payInvoice("fin-1", invoiceId, 6000, "knet");
    expect(pay.ok).toBe(true);
    if (pay.ok) {
      expect(pay.value.payment.gatewayRef.startsWith("CHG-KNET-")).toBe(true);
      expect(pay.value.totals.balanceFils).toBe(4000);
    }

    // a declined charge leaves the balance untouched (no phantom payment)
    gateway.declineNext();
    const declined = await svc.payInvoice("fin-1", invoiceId, 4000, "card");
    expect(declined.ok).toBe(false);
    if (!declined.ok) expect(declined.error.detailKey).toBe("billing.gateway.declined");
    const t = await billing.totals(invoiceId);
    expect(t.ok && t.value.balanceFils).toBe(4000); // unchanged

    // finish paying, then refund via gateway
    await svc.payInvoice("fin-1", invoiceId, 4000, "card");
    const refund = await svc.refundInvoice("fin-1", invoiceId, 2000, "knet", "overcharge");
    expect(refund.ok && refund.value.refund.gatewayRef.startsWith("RFND-KNET-")).toBe(true);
    // a declined refund changes nothing
    gateway.declineNext();
    const declinedRefund = await svc.refundInvoice("fin-1", invoiceId, 1000, "knet", "x");
    expect(declinedRefund.ok).toBe(false);
    if (!declinedRefund.ok) expect(declinedRefund.error.detailKey).toBe("billing.gateway.declined");
  });

  it("rejects a non-KNET/card method before touching the gateway (no cash)", async () => {
    const { svc, billing } = build();
    const invoiceId = await invoiced(billing);
    const cashPay = await svc.payInvoice("fin-1", invoiceId, 1000, "cash" as unknown as PaymentMethod);
    expect(cashPay.ok).toBe(false);
    if (!cashPay.ok) expect(cashPay.error.detailKey).toBe("billing.method_not_allowed");
    const cashRefund = await svc.refundInvoice("fin-1", invoiceId, 1000, "cash" as unknown as PaymentMethod, "x");
    expect(cashRefund.ok).toBe(false);
    if (!cashRefund.ok) expect(cashRefund.error.detailKey).toBe("billing.method_not_allowed");
    // a payment against an unknown invoice still propagates billing's error
    expect((await svc.payInvoice("fin-1", asId<"Invoice">("ghost"), 1000, "knet")).ok).toBe(false);
  });
});
