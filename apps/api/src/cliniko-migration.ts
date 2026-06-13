import type { AuditLog } from "@oxford/audit";
import type { RegistryService } from "@oxford/registry";
import type { BillingService } from "@oxford/billing";
import {
  activePatients,
  mapInvoice,
  mapPatient,
  openInvoices,
  reconcile,
  type ClinikoExport,
  type ImportLedger,
  type ReconciliationReport,
} from "@oxford/migration";

// Cliniko cutover orchestration (ADR-0017, Option B). Imports the ACTIVE slice
// (active patients + open balances) into Oxford HIS; idempotent (re-runnable via
// the ledger); produces a reconciliation report. Cliniko stays the read-only
// archive. App layer because it spans registry + billing (domain) modules.
const SYSTEM = "cliniko";

export interface MigrationReport {
  readonly patients: ReconciliationReport;
  readonly invoices: ReconciliationReport;
  readonly clean: boolean;
}

export class ClinikoMigrationRunner {
  constructor(
    private readonly registry: RegistryService,
    private readonly billing: BillingService,
    private readonly ledger: ImportLedger,
    private readonly audit: AuditLog,
  ) {}

  async importActiveSlice(actorId: string, exp: ClinikoExport): Promise<MigrationReport> {
    const patients = activePatients(exp);
    for (const p of patients) {
      if (await this.ledger.targetFor(SYSTEM, "patient", p.id)) continue; // already imported — idempotent
      const m = mapPatient(p);
      const person = await this.registry.registerPerson(actorId, {
        name: { ar: m.nameAr, en: m.nameEn },
        civilId: m.civilId,
        dob: m.dob,
        sex: m.sex,
        nationality: m.nationality,
        languagePref: m.languagePref,
        contact: { ...(m.phone ? { phone: m.phone } : {}), ...(m.email ? { email: m.email } : {}) },
      });
      await this.ledger.record(SYSTEM, "patient", p.id, person.id);
    }

    const invoices = openInvoices(exp);
    for (const i of invoices) {
      if (await this.ledger.targetFor(SYSTEM, "invoice", i.id)) continue;
      const patientTarget = await this.ledger.targetFor(SYSTEM, "patient", i.patientId);
      if (patientTarget === null) continue; // patient not in the active slice → left for reconciliation to flag
      const mi = mapInvoice(i);
      const created = await this.billing.createInvoice(actorId, patientTarget, [
        { chargeCode: "CLINIKO-BALANCE", description: { ar: mi.descriptionAr, en: mi.descriptionEn }, unitAmountFils: mi.outstandingFils, quantity: 1 },
      ]);
      if (created.ok) await this.ledger.record(SYSTEM, "invoice", i.id, created.value.id);
    }

    const patientsReport = reconcile(patients.map((p) => p.id), await this.ledger.importedSourceIds(SYSTEM, "patient"));
    const invoicesReport = reconcile(invoices.map((i) => i.id), await this.ledger.importedSourceIds(SYSTEM, "invoice"));
    const report: MigrationReport = { patients: patientsReport, invoices: invoicesReport, clean: patientsReport.clean && invoicesReport.clean };

    await this.audit.record({
      actorId,
      entityType: "Migration",
      entityId: SYSTEM,
      action: "CREATE",
      after: { patientsImported: patientsReport.imported, invoicesImported: invoicesReport.imported, clean: report.clean },
    });
    return report;
  }
}
