// e2e — packages & cycle bundles THROUGH the tRPC API on real Postgres (docs/01
// §E11, ADR-0037). Proves: define a versioned package; sell it (raising the
// package-price invoice — no tax, total = price); recognise delivered charges
// against the inclusion (within = covered; beyond = extra to bill); a charge not
// in the package is entirely extra; RBAC.
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

describe.skipIf(!DATABASE_URL)("packages & cycle bundles (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let fin: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.package, billing.patient_package");
    services = buildServices(pool);
    fin = appRouter.createCaller({ session: finance, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("define → sell (package-price invoice, no tax) → recognise charges → report", async () => {
    const { packageId } = await fin.packages.define({
      code: "ICSI-PKG",
      name: N("ICSI Package"),
      priceFils: 1500000,
      components: [
        { chargeCode: "CONSULT", description: N("Consultation"), includedQuantity: 1, unitAmountFils: 25000 },
        { chargeCode: "SCAN", description: N("Monitoring scan"), includedQuantity: 4, unitAmountFils: 15000 },
        { chargeCode: "RETRIEVAL", description: N("Oocyte retrieval"), includedQuantity: 1, unitAmountFils: 300000 },
      ],
    });
    expect((await fin.packages.list()).packages.map((p) => p.code)).toEqual(["ICSI-PKG"]);

    const sale = await fin.packages.sell({ patientId: "pat-1", packageId });
    // the package-price invoice equals the price (no tax)
    const paid = await fin.billing.postPayment({ invoiceId: sale.invoiceId, amountFils: 1500000, method: "knet" });
    expect(paid.balanceFils).toBe(0);

    // 4 scans included; deliver 5 → 4 recognised, 1 extra @ 15000
    const c1 = await fin.packages.captureCharge({ patientPackageId: sale.patientPackageId, chargeCode: "SCAN", quantity: 5 });
    expect(c1).toEqual({ inPackage: true, consumed: 4, extra: 1, extraAmountFils: 15000 });
    // a charge not in the package → entirely extra (valued downstream)
    const c2 = await fin.packages.captureCharge({ patientPackageId: sale.patientPackageId, chargeCode: "FREEZE", quantity: 1 });
    expect(c2).toEqual({ inPackage: false, consumed: 0, extra: 1, extraAmountFils: 0 });

    const rep = await fin.packages.recognition({ patientPackageId: sale.patientPackageId });
    const scan = rep.components.find((r) => r.chargeCode === "SCAN")!;
    expect(scan.remainingQuantity).toBe(0);
    expect(scan.recognisedFils).toBe(60000);
  });

  it("RBAC: a non-financial role cannot define or sell packages", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.packages.list(), "FORBIDDEN");
    await expectCode(() => rec.packages.sell({ patientId: "p", packageId: "x" }), "FORBIDDEN");
  });
});
