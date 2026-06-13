// e2e — patient portal read model THROUGH the tRPC API on real Postgres (docs/01
// §E13, ADR-0042). Proves a patient sees ONLY their own data: own appointments
// and own invoice balances; a cross-patient read is FORBIDDEN (own-data-only).
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

describe.skipIf(!DATABASE_URL)("patient portal read model (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment, billing.invoice, billing.payment, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a patient sees only their own appointments and balances; cross-patient is forbidden", async () => {
    const doc = await services.scheduling.addResource("practitioner", N("Dr A"));
    const type = await services.scheduling.addAppointmentType(N("Monitoring"), 30, ["practitioner"]);
    // an appointment + an invoice for pat-1, and decoys for pat-2
    await services.scheduling.book("rec-1", { typeId: type.id, patientId: "pat-1", practitionerId: doc.id, resourceIds: [], start: "2026-06-20T09:00:00.000Z", end: "2026-06-20T09:30:00.000Z" });
    await services.scheduling.book("rec-1", { typeId: type.id, patientId: "pat-2", practitionerId: doc.id, resourceIds: [], start: "2026-06-20T10:00:00.000Z", end: "2026-06-20T10:30:00.000Z" });
    const inv = await services.billing.createInvoice("fin-1", "pat-1", [{ chargeCode: "CONSULT", description: N("Consult"), unitAmountFils: 25000, quantity: 1 }]);
    if (!inv.ok) throw new Error("setup");
    await services.billing.postPayment("fin-1", inv.value.id, 10000, "knet"); // balance 15000
    await services.billing.createInvoice("fin-1", "pat-2", [{ chargeCode: "CONSULT", description: N("Consult"), unitAmountFils: 25000, quantity: 1 }]);

    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });

    const appts = await me.portal.appointments({ patientId: "pat-1" });
    expect(appts.appointments).toHaveLength(1);
    expect(appts.appointments[0]!.patientId).toBe("pat-1");

    const balances = await me.portal.balances({ patientId: "pat-1" });
    expect(balances.invoices).toHaveLength(1);
    expect(balances.invoices[0]!.totals.balanceFils).toBe(15000);

    // ATTACK: pat-1 cannot read pat-2's data
    await expectCode(() => me.portal.appointments({ patientId: "pat-2" }), "FORBIDDEN");
    await expectCode(() => me.portal.balances({ patientId: "pat-2" }), "FORBIDDEN");
  });

  it("an unauthenticated (no patient principal) caller is rejected", async () => {
    const anon = appRouter.createCaller({ session: null, patient: null, services });
    await expectCode(() => anon.portal.balances({ patientId: "pat-1" }), "UNAUTHORIZED");
  });
});
