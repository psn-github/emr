import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import type { InvoiceId, InvoiceLine } from "./types.js";

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

  it("rejects empty invoices, bad amounts, bad quantities, bad tax rates", async () => {
    const { svc } = build();
    expect((await svc.createInvoice("fin-1", "p", [])).ok).toBe(false);
    const badAmt = await svc.createInvoice("fin-1", "p", [line("X", 1.5)]);
    expect(badAmt.ok).toBe(false);
    if (!badAmt.ok) expect(badAmt.error.detailKey).toBe("billing.bad_amount");
    const badQty = await svc.createInvoice("fin-1", "p", [line("X", 1000, 0)]);
    expect(badQty.ok).toBe(false);
    if (!badQty.ok) expect(badQty.error.detailKey).toBe("billing.bad_quantity");
    const badTax = await svc.createInvoice("fin-1", "p", [line("X", 1000)], -5);
    expect(badTax.ok).toBe(false);
    if (!badTax.ok) expect(badTax.error.detailKey).toBe("billing.bad_tax_rate");
  });
});

describe("BillingService payments", () => {
  async function invoiced(taxBps = 0) {
    const ctx = build();
    const r = await ctx.svc.createInvoice("fin-1", "pat-1", [line("CONSULT", 25000), line("SCAN", 15000, 2)], taxBps);
    if (!r.ok) throw new Error("setup");
    return { ...ctx, invoice: r.value }; // total = 25000 + 30000 = 55000 fils
  }

  it("computes totals correctly", async () => {
    const { svc, invoice } = await invoiced();
    const t = await svc.totals(invoice.id);
    expect(t.ok && t.value.totalFils).toBe(55000);
    expect(t.ok && t.value.balanceFils).toBe(55000);
  });

  it("accepts a partial payment then a final payment that marks it paid", async () => {
    const { svc, invoice } = await invoiced();
    const p1 = await svc.postPayment("fin-1", invoice.id, 30000, "knet");
    expect(p1.ok && p1.value.totals.balanceFils).toBe(25000);
    expect(p1.ok && p1.value.payment.receiptNo.startsWith("RCPT-")).toBe(true);
    const p2 = await svc.postPayment("fin-1", invoice.id, 25000, "cash");
    expect(p2.ok && p2.value.totals.balanceFils).toBe(0);
    const t = await svc.totals(invoice.id);
    expect(t.ok && t.value.paidFils).toBe(55000);
    // already paid → further payment rejected
    const p3 = await svc.postPayment("fin-1", invoice.id, 1000, "cash");
    expect(p3.ok).toBe(false);
    if (!p3.ok) expect(p3.error.detailKey).toBe("billing.already_paid");
  });

  it("rejects overpayment, zero, non-integer amounts, and unknown invoices", async () => {
    const { svc, invoice } = await invoiced();
    const over = await svc.postPayment("fin-1", invoice.id, 55001, "cash");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detailKey).toBe("billing.overpayment");
    const zero = await svc.postPayment("fin-1", invoice.id, 0, "cash");
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error.detailKey).toBe("billing.zero_payment");
    const frac = await svc.postPayment("fin-1", invoice.id, 10.5, "cash");
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.error.detailKey).toBe("billing.bad_amount");
    expect((await svc.postPayment("fin-1", asId<"Invoice">("ghost") as InvoiceId, 100, "cash")).ok).toBe(false);
    expect((await svc.totals(asId<"Invoice">("ghost") as InvoiceId)).ok).toBe(false);
  });

  it("applies tax correctly when a rate is set", async () => {
    const { svc, invoice } = await invoiced(500); // 5% on 55000 = 2750
    const t = await svc.totals(invoice.id);
    expect(t.ok && t.value.taxFils).toBe(2750);
    expect(t.ok && t.value.totalFils).toBe(57750);
  });
});
