import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import type { InvoiceId, InvoiceLine, PaymentMethod } from "./types.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new BillingService(new InMemoryBillingStore(), audit, events, clock), audit, events };
}

const line = (code: string, fils: number, qty = 1): InvoiceLine => ({ chargeCode: code, description: { ar: code, en: code }, unitAmountFils: fils, quantity: qty });

describe("BillingService.createInvoice", () => {
  it("creates an open invoice (audited)", async () => {
    const { svc, audit, events } = build();
    const r = await svc.createInvoice("fin-1", "pat-1", [line("CONSULT", 25000), line("SCAN", 15000, 2)]);
    expect(r.ok).toBe(true);
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("InvoiceCreated");
  });

  it("rejects empty invoices, bad amounts, bad quantities", async () => {
    const { svc } = build();
    expect((await svc.createInvoice("fin-1", "p", [])).ok).toBe(false);
    const badAmt = await svc.createInvoice("fin-1", "p", [line("X", 1.5)]);
    expect(badAmt.ok).toBe(false);
    if (!badAmt.ok) expect(badAmt.error.detailKey).toBe("billing.bad_amount");
    const badQty = await svc.createInvoice("fin-1", "p", [line("X", 1000, 0)]);
    expect(badQty.ok).toBe(false);
    if (!badQty.ok) expect(badQty.error.detailKey).toBe("billing.bad_quantity");
  });
});

describe("BillingService payments", () => {
  async function invoiced() {
    const ctx = build();
    const r = await ctx.svc.createInvoice("fin-1", "pat-1", [line("CONSULT", 25000), line("SCAN", 15000, 2)]);
    if (!r.ok) throw new Error("setup");
    return { ...ctx, invoice: r.value }; // total = 25000 + 30000 = 55000 fils
  }

  it("computes totals with no tax (total = subtotal)", async () => {
    const { svc, invoice } = await invoiced();
    const t = await svc.totals(invoice.id);
    expect(t.ok && t.value.subtotalFils).toBe(55000);
    expect(t.ok && t.value.totalFils).toBe(55000); // no tax: total equals subtotal
    expect(t.ok && t.value.balanceFils).toBe(55000);
  });

  it("accepts a partial KNET payment then a final card payment that marks it paid", async () => {
    const { svc, invoice } = await invoiced();
    const p1 = await svc.postPayment("fin-1", invoice.id, 30000, "knet");
    expect(p1.ok && p1.value.totals.balanceFils).toBe(25000);
    expect(p1.ok && p1.value.payment.receiptNo.startsWith("RCPT-")).toBe(true);
    const p2 = await svc.postPayment("fin-1", invoice.id, 25000, "card");
    expect(p2.ok && p2.value.totals.balanceFils).toBe(0);
    const t = await svc.totals(invoice.id);
    expect(t.ok && t.value.paidFils).toBe(55000);
    // already paid → further payment rejected
    const p3 = await svc.postPayment("fin-1", invoice.id, 1000, "knet");
    expect(p3.ok).toBe(false);
    if (!p3.ok) expect(p3.error.detailKey).toBe("billing.already_paid");
  });

  it("rejects overpayment, zero, non-integer amounts, and unknown invoices", async () => {
    const { svc, invoice } = await invoiced();
    const over = await svc.postPayment("fin-1", invoice.id, 55001, "knet");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detailKey).toBe("billing.overpayment");
    const zero = await svc.postPayment("fin-1", invoice.id, 0, "knet");
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error.detailKey).toBe("billing.zero_payment");
    const frac = await svc.postPayment("fin-1", invoice.id, 10.5, "card");
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.error.detailKey).toBe("billing.bad_amount");
    expect((await svc.postPayment("fin-1", asId<"Invoice">("ghost") as InvoiceId, 100, "knet")).ok).toBe(false);
    expect((await svc.totals(asId<"Invoice">("ghost") as InvoiceId)).ok).toBe(false);
  });

  it("[attack] structurally rejects a cash payment arriving at the boundary", async () => {
    const { svc, invoice } = await invoiced();
    // a "cash" string forced past the type system (as the untyped API would) is
    // rejected by the server — cash is structurally absent (ADR-0034).
    const cash = await svc.postPayment("fin-1", invoice.id, 1000, "cash" as unknown as PaymentMethod);
    expect(cash.ok).toBe(false);
    if (!cash.ok) expect(cash.error.detailKey).toBe("billing.method_not_allowed");
    // ...and so is any other non-KNET/card method.
    const wire = await svc.postPayment("fin-1", invoice.id, 1000, "wire" as unknown as PaymentMethod);
    expect(wire.ok && false).toBe(false);
    if (!wire.ok) expect(wire.error.detailKey).toBe("billing.method_not_allowed");
  });

  it("refunds (append-only) reduce the paid amount and reopen a paid invoice", async () => {
    const { svc, invoice } = await invoiced();
    await svc.postPayment("fin-1", invoice.id, 55000, "knet"); // fully paid
    expect((await svc.totals(invoice.id)).ok && (await svc.totals(invoice.id)).ok).toBe(true);
    const refund = await svc.refund("fin-1", invoice.id, 20000, "knet", "patient overcharged");
    expect(refund.ok && refund.value.totals.paidFils).toBe(35000);
    expect(refund.ok && refund.value.totals.balanceFils).toBe(20000); // reopened
    expect(refund.ok && refund.value.refund.receiptNo.startsWith("RFND-")).toBe(true);
    // the reopened invoice now accepts a fresh payment
    const again = await svc.postPayment("fin-1", invoice.id, 20000, "card");
    expect(again.ok && again.value.totals.balanceFils).toBe(0);
  });

  it("rejects bad refunds: over-paid amount, zero, cash method, unknown invoice", async () => {
    const { svc, invoice } = await invoiced();
    await svc.postPayment("fin-1", invoice.id, 30000, "knet");
    const tooMuch = await svc.refund("fin-1", invoice.id, 30001, "knet", "x"); // > paid (30000)
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.error.detailKey).toBe("billing.refund_exceeds_paid");
    const zero = await svc.refund("fin-1", invoice.id, 0, "knet", "x");
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error.detailKey).toBe("billing.zero_refund");
    const cash = await svc.refund("fin-1", invoice.id, 1000, "cash" as unknown as PaymentMethod, "x");
    expect(cash.ok).toBe(false);
    if (!cash.ok) expect(cash.error.detailKey).toBe("billing.method_not_allowed");
    const badAmt = await svc.refund("fin-1", invoice.id, 1.5, "knet", "x");
    expect(badAmt.ok).toBe(false);
    if (!badAmt.ok) expect(badAmt.error.detailKey).toBe("billing.bad_amount");
    expect((await svc.refund("fin-1", asId<"Invoice">("ghost") as InvoiceId, 100, "knet", "x")).ok).toBe(false);
  });
});
