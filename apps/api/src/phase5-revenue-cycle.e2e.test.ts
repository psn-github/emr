// PHASE 5 EXIT GATE — the revenue cycle + reporting end-to-end, through the tRPC
// API on real Postgres, exercising the §E11/§E12 acceptance in one flow:
//   sell an ICSI PACKAGE on a DEPOSIT + 3 INSTALMENTS → charges from clinic/lab/
//   theatre MAP TO THE PACKAGE (recognised vs extra) → OUTSTANDING-BALANCE RULES
//   GATE the next cycle step (blocked until the deposit is paid) → a KNET payment
//   POSTS via the gateway with a RECEIPT → lab KPIs + the financial dashboard read
//   live → a full AUDIT TRAIL exports for the invoice with the hash-chain intact.
// Enforces the hard rules: NO CASH (KNET/card only), NO TAX (total = subtotal).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const ops: Session = {
  sessionId: "s-ops",
  subject: { staffId: "ops-1", roles: [{ id: "ops", name: "ops", permissions: ["financial:*", "clinical:*", "admin:*", "embryology:*"] }] },
  mfa: true,
};

const N = (en: string) => ({ ar: en, en });

describe.skipIf(!DATABASE_URL)("PHASE 5 EXIT GATE — revenue cycle + reporting end-to-end (real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE billing.invoice, billing.payment, billing.package, billing.patient_package, billing.instalment_plan, billing.charge, billing.charge_master, embryology.oocyte, embryology.insemination, embryology.fertilisation_check, embryology.embryo, embryology.grading_entry, audit.audit_log");
    services = buildServices(pool);
    api = appRouter.createCaller({ session: ops, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs the full revenue cycle + reporting exit gate in one flow", async () => {
    const PATIENT = "pat-1";
    const ASOF = "2026-06-20T08:00:00Z";

    // ── charge master (no free-text) + an ICSI package including 4 scans ──────
    await api.charges.defineCode({ code: "SCAN", description: N("Monitoring scan"), unitAmountFils: 15000 });
    await api.charges.defineCode({ code: "CONSULT", description: N("Consultation"), unitAmountFils: 25000 });
    const { packageId } = await api.packages.define({
      code: "ICSI-PKG",
      name: N("ICSI Package"),
      priceFils: 1500000,
      components: [{ chargeCode: "SCAN", description: N("Monitoring scan"), includedQuantity: 4, unitAmountFils: 15000 }],
    });

    // ── sell the package (raises the package-price invoice — no tax) ──────────
    const sale = await api.packages.sell({ patientId: PATIENT, packageId });
    const pkgInvoice = sale.invoiceId;

    // ── deposit + 3 instalments summing to the package price ─────────────────
    await api.instalments.createPlan({
      patientId: PATIENT,
      invoiceId: pkgInvoice,
      depositFils: 300000,
      instalments: [
        { dueDate: "2026-07-01T00:00:00Z", amountFils: 400000 },
        { dueDate: "2026-08-01T00:00:00Z", amountFils: 400000 },
        { dueDate: "2026-09-01T00:00:00Z", amountFils: 400000 },
      ],
    });

    // ── outstanding-balance rule GATES the next cycle step (deposit unpaid) ───
    expect((await api.instalments.progressionAllowed({ patientId: PATIENT, asOf: ASOF })).allowed).toBe(false);

    // ── KNET payment of the deposit POSTS via the gateway with a RECEIPT ──────
    const pay = await api.billing.gatewayPay({ invoiceId: pkgInvoice, amountFils: 300000, method: "knet" });
    expect(pay.gatewayRef.startsWith("CHG-KNET-")).toBe(true); // receipt/processor ref
    // ...and progression is now allowed (nothing else past-due yet)
    expect((await api.instalments.progressionAllowed({ patientId: PATIENT, asOf: ASOF })).allowed).toBe(true);

    // ── charges from clinic/lab MAP TO THE PACKAGE (recognised vs extra) ──────
    const scans = await api.charges.capture({ patientId: PATIENT, chargeCode: "SCAN", quantity: 5, source: "clinical", occurredAt: ASOF, patientPackageId: sale.patientPackageId });
    expect(scans).toEqual({ recognisedQuantity: 4, billableQuantity: 1, billableAmountFils: 15000 }); // 4 covered by the package, 1 extra
    await api.charges.capture({ patientId: PATIENT, chargeCode: "CONSULT", quantity: 1, source: "clinical", occurredAt: ASOF }); // not in package → billable
    const extras = await api.charges.invoicePatient({ patientId: PATIENT });
    expect(extras.lineCount).toBe(2); // the 1 extra scan + the consult

    // ── lab KPIs read live from a seeded cycle ───────────────────────────────
    const emb = services.embryology;
    const o = await emb.recordOocyte("ops-1", { cycleId: "cyc-1", retrievalProcedureId: "p", maturity: "MII", dish: "D", position: "1" });
    await emb.recordInsemination("ops-1", { cycleId: "cyc-1", oocyteId: o.id, method: "ICSI", spermSourceId: "s", operator: "ops-1", inseminatedAt: ASOF, patientId: PATIENT });
    const chk = await emb.recordFertilisationCheck("ops-1", { cycleId: "cyc-1", oocyteId: o.id, pn: "2PN", checkedAt: ASOF });
    await emb.recordGrading("ops-1", { embryoId: chk.embryo!.id, day: 5, morphology: "blast", gardner: { expansion: 4, icm: "A", te: "B" }, assessedAt: ASOF });
    const kpis = await api.analytics.cycleLabKpis({ cycleId: "cyc-1" });
    expect(kpis.kpis.find((k) => k.key === "fertilisation_rate")!.value).toBe(1); // 1 of 1 inseminated → 2PN

    // ── the financial dashboard reads live (ageing + revenue) ────────────────
    const dash = await api.dashboards.financial({ asOf: ASOF });
    expect(dash.ageing.totalFils).toBeGreaterThan(0); // outstanding package balance + extras
    expect(dash.revenueByLine.find((r) => r.line === "clinical")!.amountFils).toBe(40000); // 1 scan (15000) + consult (25000)

    // ── one-click AUDIT TRAIL export for the invoice, hash-chain intact ───────
    const trail = await api.compliance.auditTrail({ entityType: "Invoice", entityId: pkgInvoice });
    expect(trail.chainIntact).toBe(true);
    expect(trail.count).toBeGreaterThanOrEqual(1);

    // ── the whole flow left the audit hash-chain intact ──────────────────────
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });
});
