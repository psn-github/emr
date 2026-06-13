// e2e — KNET/card payment gateway THROUGH the tRPC API on real Postgres (docs/01
// §E11, ADR-0036). Proves: a captured gateway charge records a payment carrying
// the gateway reference; a DECLINED charge records nothing (balance unchanged);
// a gateway refund records with its ref; cash is still rejected (no cash).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const finance: Session = { sessionId: "s-fin", subject: { staffId: "fin-1", roles: [{ id: "finance", name: "finance", permissions: ["financial:*"] }] }, mfa: true };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("gateway payments — KNET/card (e2e via the API + real Postgres)", () => {
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

  it("captures a KNET charge (with gateway ref); a declined charge records nothing; refund via gateway", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-1", lines: [{ chargeCode: "ICSI", description: N("ICSI"), unitAmountFils: 10000, quantity: 1 }] });

    const pay = await fin.billing.gatewayPay({ invoiceId, amountFils: 6000, method: "knet" });
    expect(pay.balanceFils).toBe(4000);
    expect(pay.gatewayRef.startsWith("CHG-KNET-")).toBe(true);

    // force the next gateway op to decline → no payment recorded, balance unchanged
    services.paymentGateway.declineNext();
    await expectCode(() => fin.billing.gatewayPay({ invoiceId, amountFils: 4000, method: "card" }), "BAD_REQUEST");
    const stillOwed = await fin.billing.gatewayPay({ invoiceId, amountFils: 4000, method: "card" }); // retry captures
    expect(stillOwed.balanceFils).toBe(0);

    const refund = await fin.billing.gatewayRefund({ invoiceId, amountFils: 2000, method: "knet", reason: "overcharge" });
    expect(refund.balanceFils).toBe(2000);
    expect(refund.gatewayRef.startsWith("RFND-KNET-")).toBe(true);

    // the gateway reference is persisted on the payment rows
    const refs = await pool.query<{ gateway_ref: string }>("SELECT gateway_ref FROM billing.payment WHERE invoice_id = $1 ORDER BY at", [invoiceId]);
    expect(refs.rows.every((r) => r.gateway_ref.length > 0)).toBe(true);
  });

  it("[attack] a cash method at the gateway boundary is rejected (no cash)", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-2", lines: [{ chargeCode: "C", description: N("C"), unitAmountFils: 1000, quantity: 1 }] });
    await expectCode(() => fin.billing.gatewayPay({ invoiceId, amountFils: 1000, method: "cash" as never }), "BAD_REQUEST");
  });
});
