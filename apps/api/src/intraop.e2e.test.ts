// e2e — intra-op/anaesthesia record + consumables→billing THROUGH the tRPC API on
// real Postgres (docs/01 §E7). Proves: anaesthetic drugs must come from the
// formulary; consumables deduct stock (stub) and raise a REAL multi-line invoice
// in @oxford/billing with the correct total; lot/specimen traceability; RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*", "financial:*"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("intra-op + consumables→billing (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE perioperative.intraop_record, perioperative.consumable_use, perioperative.specimen_record, billing.invoice, billing.payment");
    services = buildServices(pool);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  const intraOp = { encounterId: "enc-1", procedurePerformed: "hysteroscopy", findings: "normal", anaestheticTechnique: "GA", drugs: [{ formularyCode: "propofol", dose: 200, unit: "mg" as const }], staff: ["surgeon-1"], startedAt: "2026-06-22T09:00:00Z", finishedAt: "2026-06-22T09:45:00Z" };

  it("records an intra-op note (formulary drugs) and rejects a non-formulary drug", async () => {
    const r = await doc.perioperative.recordIntraOp(intraOp);
    expect(r.recordId).toBeTruthy();
    await expectCode(() => doc.perioperative.recordIntraOp({ ...intraOp, encounterId: "enc-2", drugs: [{ formularyCode: "whisky", dose: 1, unit: "mg" }] }), "BAD_REQUEST");
  });

  it("consumables deduct stock + raise a real invoice with the correct total; lot is required", async () => {
    const r = await doc.perioperative.recordConsumables({
      encounterId: "enc-1",
      patientId: "pat-1",
      uses: [
        { code: "mesh", description: "Hernia mesh", lotNo: "LOT-A", quantity: 1, unitPriceFils: 50000 },
        { code: "suture", description: "Suture", lotNo: "LOT-B", quantity: 3, unitPriceFils: 2000 },
      ],
      recordedAt: "2026-06-22T09:30:00Z",
    });
    expect(r.count).toBe(2);
    // stock deducted via the stub
    expect(services.inventoryOutbox.deductions[0]!.items).toHaveLength(2);
    // a real billing invoice exists with total 50000 + 3×2000 = 56000 fils
    const totals = await services.billing.totals(r.invoiceRef as never);
    expect(totals.ok && totals.value.totalFils).toBe(56000);

    // a consumable without a lot is rejected (traceability)
    await expectCode(() => doc.perioperative.recordConsumables({ encounterId: "enc-1", patientId: "pat-1", uses: [{ code: "x", description: "x", lotNo: "", quantity: 1, unitPriceFils: 1 }], recordedAt: "z" }), "BAD_REQUEST");
  });

  it("RBAC: a reception role cannot record intra-op data", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.recordIntraOp(intraOp), "FORBIDDEN");
  });
});
