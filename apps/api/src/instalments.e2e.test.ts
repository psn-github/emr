// e2e — deposits & instalment plans + the cycle-progression gate THROUGH the tRPC
// API on real Postgres (docs/01 §E11, ADR-0038). Proves: a plan pays down an
// invoice (deposit + dated instalments summing to the total); progression is
// BLOCKED while a past-due amount is unpaid (deposit, then each instalment) and
// ALLOWED once paid; the patient-level FinanceGate reflects the same; RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const finance: Session = { sessionId: "s-fin", subject: { staffId: "fin-1", roles: [{ id: "finance", name: "finance", permissions: ["financial:*"] }] }, mfa: true };
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}
const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("deposits & instalment plans (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let fin: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.instalment_plan");
    services = buildServices(pool);
    fin = appRouter.createCaller({ session: finance, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("sells an ICSI package on a deposit + instalments; arrears gate the next cycle step", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-1", lines: [{ chargeCode: "ICSI", description: N("ICSI cycle"), unitAmountFils: 1000000, quantity: 1 }] });
    const { planId } = await fin.instalments.createPlan({
      patientId: "pat-1",
      invoiceId,
      depositFils: 200000,
      instalments: [{ dueDate: "2026-07-01T00:00:00Z", amountFils: 400000 }, { dueDate: "2026-08-01T00:00:00Z", amountFils: 400000 }],
    });

    // deposit unpaid → progression blocked
    const before = await fin.instalments.assess({ planId, asOf: "2026-06-15T00:00:00Z" });
    expect(before.allowed).toBe(false);
    expect(before.arrearsFils).toBe(200000);
    expect((await fin.instalments.progressionAllowed({ patientId: "pat-1", asOf: "2026-06-15T00:00:00Z" })).allowed).toBe(false);

    // pay the deposit (KNET) → progression allowed (nothing else due yet)
    await fin.billing.postPayment({ invoiceId, amountFils: 200000, method: "knet" });
    expect((await fin.instalments.assess({ planId, asOf: "2026-06-15T00:00:00Z" })).allowed).toBe(true);

    // first instalment becomes due and unpaid → blocked again
    const overdue = await fin.instalments.assess({ planId, asOf: "2026-07-02T00:00:00Z" });
    expect(overdue.allowed).toBe(false);
    expect(overdue.arrearsFils).toBe(400000);
    // pay it (card) → allowed once more
    await fin.billing.postPayment({ invoiceId, amountFils: 400000, method: "card" });
    expect((await fin.instalments.assess({ planId, asOf: "2026-07-02T00:00:00Z" })).allowed).toBe(true);
  });

  it("rejects a plan whose total ≠ the invoice; RBAC blocks a non-financial role", async () => {
    const { invoiceId } = await fin.billing.createInvoice({ patientId: "pat-2", lines: [{ chargeCode: "ICSI", description: N("ICSI"), unitAmountFils: 1000000, quantity: 1 }] });
    await expectCode(() => fin.instalments.createPlan({ patientId: "pat-2", invoiceId, depositFils: 100000, instalments: [{ dueDate: "2026-07-01T00:00:00Z", amountFils: 100000 }] }), "BAD_REQUEST");
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.instalments.createPlan({ patientId: "p", invoiceId, depositFils: 0, instalments: [] }), "FORBIDDEN");
  });
});
