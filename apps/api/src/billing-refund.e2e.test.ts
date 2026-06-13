// e2e — billing core rules THROUGH the tRPC API on real Postgres (docs/01 §E11,
// ADR-0034/0035): NO CASH (a "cash" string at the boundary is rejected; KNET/card
// only), NO TAX (invoice total = subtotal), and REFUNDS (append-only, reopen a
// paid invoice). RBAC: refunds need the financial refund permission.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const finance: Session = { sessionId: "s-fin", subject: { staffId: "fin-1", roles: [{ id: "finance", name: "finance", permissions: ["financial:*"] }] }, mfa: true };
const noRefund: Session = { sessionId: "s-fin2", subject: { staffId: "fin-2", roles: [{ id: "cashier", name: "cashier", permissions: ["financial:invoice.write", "financial:payment.post"] }] }, mfa: true };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("billing — no cash / no tax / refunds (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let fin: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment");
    services = buildServices(pool);
    fin = appRouter.createCaller({ session: finance, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("no tax: total = subtotal; KNET + card pay it off; a refund reopens it", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-1", lines: [{ chargeCode: "CONSULT", description: N("Consultation"), unitAmountFils: 25000, quantity: 1 }, { chargeCode: "SCAN", description: N("Scan"), unitAmountFils: 15000, quantity: 2 }] });
    const p1 = await fin.billing.postPayment({ invoiceId, amountFils: 30000, method: "knet" });
    expect(p1.balanceFils).toBe(25000); // 55000 total (no tax), 30000 paid
    const p2 = await fin.billing.postPayment({ invoiceId, amountFils: 25000, method: "card" });
    expect(p2.balanceFils).toBe(0);

    const refund = await fin.billing.refund({ invoiceId, amountFils: 10000, method: "card", reason: "overcharge" });
    expect(refund.balanceFils).toBe(10000); // reopened
    expect(refund.receiptNo.startsWith("RFND-")).toBe(true);
  });

  it("[attack] a cash payment/refund at the API boundary is rejected (no cash)", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-2", lines: [{ chargeCode: "CONSULT", description: N("Consultation"), unitAmountFils: 10000, quantity: 1 }] });
    // method is typed knet|card, but the API input is cast — force a cash string past it.
    await expectCode(() => fin.billing.postPayment({ invoiceId, amountFils: 1000, method: "cash" as never }), "BAD_REQUEST");
    await expectCode(() => fin.billing.refund({ invoiceId, amountFils: 1000, method: "cash" as never, reason: "x" }), "BAD_REQUEST");
  });

  it("RBAC: a cashier without the refund permission cannot refund", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-3", lines: [{ chargeCode: "CONSULT", description: N("Consultation"), unitAmountFils: 10000, quantity: 1 }] });
    await fin.billing.postPayment({ invoiceId, amountFils: 10000, method: "knet" });
    const cashier = appRouter.createCaller({ session: noRefund, patient: null, services });
    await expectCode(() => cashier.billing.refund({ invoiceId, amountFils: 1000, method: "knet", reason: "x" }), "FORBIDDEN");
  });
});
