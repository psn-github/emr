// e2e — item-level charge capture THROUGH the tRPC API on real Postgres (docs/01
// §E11). Proves: charges are priced from the charge master (no free-text — an
// unknown code is rejected); charges from clinical/lab/theatre map to a patient
// and batch into one invoice (no tax → total = sum of lines); a charge recognised
// against a package inclusion bills only the excess; RBAC.
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
const T = "2026-06-20T08:00:00Z";

describe.skipIf(!DATABASE_URL)("item-level charge capture (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let fin: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.charge, billing.charge_master, billing.package, billing.patient_package");
    services = buildServices(pool);
    fin = appRouter.createCaller({ session: finance, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("captures clinical/lab/theatre charges and batches them into one invoice; unknown code rejected", async () => {
    await fin.charges.defineCode({ code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    await fin.charges.defineCode({ code: "BLOOD", description: N("Blood test"), unitAmountFils: 8000 });
    await fin.charges.defineCode({ code: "THEATRE", description: N("Theatre time"), unitAmountFils: 500000 });
    expect((await fin.charges.listCodes()).codes.map((c) => c.code).sort()).toEqual(["BLOOD", "CONSULT", "THEATRE"]);

    // no free-text charges
    await expectCode(() => fin.charges.capture({ patientId: "pat-1", chargeCode: "MASSAGE", quantity: 1, source: "clinical", occurredAt: T }), "BAD_REQUEST");

    await fin.charges.capture({ patientId: "pat-1", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: T });
    await fin.charges.capture({ patientId: "pat-1", chargeCode: "BLOOD", quantity: 3, source: "lab", occurredAt: T });
    await fin.charges.capture({ patientId: "pat-1", chargeCode: "THEATRE", quantity: 1, source: "theatre", occurredAt: T });

    const inv = await fin.charges.invoicePatient({ patientId: "pat-1" });
    expect(inv.lineCount).toBe(3);
    // total = 25000 + 3*8000 + 500000 = 549000 (no tax)
    const paid = await fin.billing.postPayment({ invoiceId: inv.invoiceId, amountFils: 549000, method: "knet" });
    expect(paid.balanceFils).toBe(0);
    // nothing left to invoice
    await expectCode(() => fin.charges.invoicePatient({ patientId: "pat-1" }), "BAD_REQUEST");
  });

  it("recognises a charge against a package inclusion and bills only the excess", async () => {
    await fin.charges.defineCode({ code: "SCAN", description: N("Scan"), unitAmountFils: 15000 });
    const { packageId } = await fin.packages.define({ code: "MON-PKG", name: N("Monitoring package"), priceFils: 60000, components: [{ chargeCode: "SCAN", description: N("Scan"), includedQuantity: 4, unitAmountFils: 15000 }] });
    const sale = await fin.packages.sell({ patientId: "pat-2", packageId });

    const cap = await fin.charges.capture({ patientId: "pat-2", chargeCode: "SCAN", quantity: 5, source: "clinical", occurredAt: T, patientPackageId: sale.patientPackageId });
    expect(cap).toEqual({ recognisedQuantity: 4, billableQuantity: 1, billableAmountFils: 15000 });
    const inv = await fin.charges.invoicePatient({ patientId: "pat-2" }); // only the 1 excess scan
    expect(inv.lineCount).toBe(1);
  });

  it("RBAC: a non-financial role cannot capture charges", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.charges.capture({ patientId: "p", chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: T }), "FORBIDDEN");
  });
});
