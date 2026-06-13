// e2e — Cliniko active-slice cutover (Option B) against real Postgres: import,
// idempotent re-run, reconciliation, and the adversarial checks (discrepancy
// detection + Civil ID encrypted at rest).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PgImportLedger, type ClinikoExport } from "@oxford/migration";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { ClinikoMigrationRunner } from "./cliniko-migration.js";

const DATABASE_URL = process.env.DATABASE_URL;
// The migration-ledger table migration lives in @oxford/migration; runMigrations applies it.

const exportData: ClinikoExport = {
  patients: [
    { id: "c1", firstNameEn: "Mohammed", lastNameEn: "Ali", civilId: "284010112345", dob: "1984-01-01", sex: "male", nationality: "KW", archived: false },
    { id: "c2", firstNameEn: "Sara", lastNameEn: "Khan", civilId: "286050167890", dob: "1986-05-01", sex: "female", nationality: "KW", archived: false },
    { id: "c3", firstNameEn: "Old", lastNameEn: "Record", civilId: "270010100000", dob: "1970-01-01", sex: "male", nationality: "KW", archived: true },
  ],
  invoices: [
    { id: "i1", patientId: "c1", descriptionEn: "Outstanding balance", outstandingFils: 25000 },
    { id: "i2", patientId: "c1", descriptionEn: "Settled", outstandingFils: 0 },
  ],
  appointments: [],
};

describe.skipIf(!DATABASE_URL)("Cliniko cutover (Option B) e2e", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, billing.invoice, billing.payment, audit.audit_log, migration.import_ledger");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("imports the active slice, is idempotent on re-run, and reconciles clean", async () => {
    const runner = new ClinikoMigrationRunner(services.registry, services.billing, new PgImportLedger(pool), services.audit);

    const first = await runner.importActiveSlice("migration-bot", exportData);
    expect(first.patients.imported).toBe(2); // c3 archived → excluded
    expect(first.invoices.imported).toBe(1); // i2 settled → excluded
    expect(first.clean).toBe(true);

    const personCount = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM registry.person");
    expect(personCount.rows[0]!.n).toBe("2");

    // Re-run: idempotent — no duplicates.
    const second = await runner.importActiveSlice("migration-bot", exportData);
    expect(second.clean).toBe(true);
    const personCount2 = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM registry.person");
    expect(personCount2.rows[0]!.n).toBe("2");
  });

  it("[attack] reconciliation flags an open invoice whose patient is NOT in the active slice", async () => {
    const runner = new ClinikoMigrationRunner(services.registry, services.billing, new PgImportLedger(pool), services.audit);
    const orphanInvoice: ClinikoExport = {
      patients: [exportData.patients[0]!],
      invoices: [{ id: "i9", patientId: "c-archived", descriptionEn: "balance for an archived patient", outstandingFils: 5000 }],
      appointments: [],
    };
    const report = await runner.importActiveSlice("migration-bot", orphanInvoice);
    console.log("[attack] invoice for non-migrated patient → reconciliation:", report.invoices.clean ? "MISSED (FAIL)" : `FLAGGED (missing ${report.invoices.missing.join(",")})`);
    expect(report.invoices.clean).toBe(false);
    expect(report.invoices.missing).toEqual(["i9"]);
  });

  it("[attack] imported Civil ID is encrypted at rest", async () => {
    const runner = new ClinikoMigrationRunner(services.registry, services.billing, new PgImportLedger(pool), services.audit);
    await runner.importActiveSlice("migration-bot", exportData);
    const raw = await pool.query<{ civil_id_enc: string }>("SELECT civil_id_enc FROM registry.person LIMIT 1");
    const atRest = raw.rows[0]!.civil_id_enc;
    console.log("[attack] migrated civil_id at rest:", atRest.slice(0, 20) + "…");
    expect(atRest).not.toContain("284010112345");
    expect(atRest).not.toContain("286050167890");
    expect(atRest.startsWith("v1.")).toBe(true);
  });
});
