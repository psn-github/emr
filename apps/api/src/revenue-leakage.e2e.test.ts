// P2 — REVENUE-CYCLE LEAKAGE DETECTION, end-to-end on real Postgres. Proves:
// billable charges recorded but never rolled into an invoice surface as revenue
// leakage (grouped by source, with an aged subset), while invoiced and
// package-recognised charges do not. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LeakageCharge } from "@oxford/analytics";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });
const ASOF = Date.parse("2026-06-17T00:00:00.000Z");
const DAY = 86_400_000;

describe.skipIf(!DATABASE_URL)("P2 revenue-cycle leakage (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("flags uninvoiced billable charges as leakage; invoiced ones are excluded", async () => {
    await services.charges.defineChargeCode("fin-1", { code: "LEAK_SCAN", description: N("Scan"), unitAmountFils: 15000 });
    await services.charges.defineChargeCode("fin-1", { code: "LEAK_BLOOD", description: N("Blood"), unitAmountFils: 8000 });

    // leak-A: an invoiced charge (NOT leakage)
    await services.charges.capture("doc-1", { patientId: "leak-A", chargeCode: "LEAK_SCAN", quantity: 1, source: "clinical", occurredAt: "2026-06-10T08:00:00.000Z" });
    await services.charges.invoicePatient("fin-1", "leak-A");

    // leak-B: two uninvoiced billable charges (leakage) — one recent, one aged
    await services.charges.capture("lab-1", { patientId: "leak-B", chargeCode: "LEAK_BLOOD", quantity: 2, source: "lab", occurredAt: "2026-06-12T08:00:00.000Z" }); // recent: 16000
    await services.charges.capture("lab-1", { patientId: "leak-B", chargeCode: "LEAK_SCAN", quantity: 1, source: "theatre", occurredAt: "2026-04-01T08:00:00.000Z" }); // aged: 15000

    // map this run's uninvoiced billable charges → leakage rows (age vs ASOF)
    const mine = (await services.charges.uninvoicedBillable()).filter((c) => c.patientId.startsWith("leak-"));
    const rows: LeakageCharge[] = mine.map((c) => ({
      source: c.source,
      amountFils: c.quantity * c.unitAmountFils,
      ageDays: Math.floor((ASOF - Date.parse(c.occurredAt)) / DAY),
      recognised: c.recognised,
      invoiced: c.invoiceId !== null,
    }));

    const report = services.analytics.leakage(rows, 30);
    expect(report.leakedCount).toBe(2);
    expect(report.totalFils).toBe(31000); // 16000 + 15000
    expect(report.agedFils).toBe(15000); // only the April charge is > 30 days old
    expect(report.bySource).toEqual([
      { source: "lab", amountFils: 16000, count: 1 },
      { source: "theatre", amountFils: 15000, count: 1 },
    ]);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
