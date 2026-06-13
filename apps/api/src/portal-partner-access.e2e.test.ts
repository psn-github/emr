// e2e — consent-gated partner access THROUGH the tRPC API on real Postgres
// (docs/01 §E13, ADR-0042). Proves: a partner has NO access by default; once the
// patient grants access the partner can READ the patient's data; revoking removes
// it; the grant is the patient's to manage (own-data); writes stay own-only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("consent-gated partner access (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE consent.partner_access_grant, billing.invoice, billing.payment, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a partner reads the patient's data only while an active grant exists", async () => {
    // a balance for pat-1
    const inv = await services.billing.createInvoice("fin-1", "pat-1", [{ chargeCode: "CONSULT", description: N("Consult"), unitAmountFils: 25000, quantity: 1 }]);
    if (!inv.ok) throw new Error("setup");

    const patient = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    const partner = appRouter.createCaller({ session: null, patient: { patientId: "partner-1" }, services });

    // before any grant: the partner cannot read pat-1's balances
    await expectCode(() => partner.portal.balances({ patientId: "pat-1" }), "FORBIDDEN");

    // the patient grants the partner access
    await patient.portal.grantPartnerAccess({ patientId: "pat-1", partnerId: "partner-1" });
    // now the partner can READ pat-1's balances
    const seen = await partner.portal.balances({ patientId: "pat-1" });
    expect(seen.invoices).toHaveLength(1);
    expect((await patient.portal.partnerGrants({ patientId: "pat-1" })).grants).toHaveLength(1);

    // a partner may NOT perform writes on the patient's behalf (own-only)
    await expectCode(() => partner.portal.payInvoice({ patientId: "pat-1", invoiceId: inv.value.id, amountFils: 1000, method: "knet" }), "FORBIDDEN");

    // the patient revokes → the partner loses access
    await patient.portal.revokePartnerAccess({ patientId: "pat-1", partnerId: "partner-1" });
    await expectCode(() => partner.portal.balances({ patientId: "pat-1" }), "FORBIDDEN");
  });

  it("only the patient manages their own grants; a non-granted partner has no access", async () => {
    const partner = appRouter.createCaller({ session: null, patient: { patientId: "partner-1" }, services });
    // a partner cannot grant themselves access to someone else (own-data on the grant)
    await expectCode(() => partner.portal.grantPartnerAccess({ patientId: "pat-1", partnerId: "partner-1" }), "FORBIDDEN");
    // and has no read access
    await expectCode(() => partner.portal.appointments({ patientId: "pat-1" }), "FORBIDDEN");
  });
});
