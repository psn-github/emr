// e2e — patient portal payments THROUGH the tRPC API on real Postgres (docs/01
// §E13, ADR-0034/0036/0042). Proves: a patient pays their OWN invoice via the
// KNET/card gateway (receipt ref; balance falls); cannot pay someone else's
// invoice; cash is rejected (no cash); own-data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });
const finance: Session = { sessionId: "s-fin", subject: { staffId: "fin-1", roles: [{ id: "finance", name: "finance", permissions: ["financial:*"] }] }, mfa: true };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("portal payments (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a patient pays their own invoice via the gateway; cannot pay another's; no cash", async () => {
    const fin = appRouter.createCaller({ session: finance, patient: null, services });
    const mine = await services.billing.createInvoice("fin-1", "pat-1", [{ chargeCode: "CONSULT", description: N("Consult"), unitAmountFils: 25000, quantity: 1 }]);
    const other = await services.billing.createInvoice("fin-1", "pat-2", [{ chargeCode: "CONSULT", description: N("Consult"), unitAmountFils: 25000, quantity: 1 }]);
    if (!mine.ok || !other.ok) throw new Error("setup");
    void fin;

    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });

    // pays own invoice (KNET) → balance drops, gateway ref returned
    const paid = await me.portal.payInvoice({ patientId: "pat-1", invoiceId: mine.value.id, amountFils: 10000, method: "knet" });
    expect(paid.balanceFils).toBe(15000);
    expect(paid.gatewayRef.startsWith("CHG-KNET-")).toBe(true);

    // cannot pay another patient's invoice (own-data)
    await expectCode(() => me.portal.payInvoice({ patientId: "pat-1", invoiceId: other.value.id, amountFils: 1000, method: "knet" }), "FORBIDDEN");
    // cannot act under another patient's id
    await expectCode(() => me.portal.payInvoice({ patientId: "pat-2", invoiceId: other.value.id, amountFils: 1000, method: "knet" }), "FORBIDDEN");
    // cash is rejected at the boundary (no cash)
    await expectCode(() => me.portal.payInvoice({ patientId: "pat-1", invoiceId: mine.value.id, amountFils: 1000, method: "cash" as never }), "BAD_REQUEST");
  });
});
