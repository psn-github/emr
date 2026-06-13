import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Package, PackageId, PatientPackage, PatientPackageId, PatientPackageComponent } from "./types.js";
import type { PackageStore } from "./package-store.js";
import type { BillingService } from "./billing-service.js";
import { validatePackage, recognise, type PackageInput } from "./packages.js";

export interface SellResult {
  readonly patientPackage: PatientPackage;
  readonly invoiceId: string;
}
export interface CaptureResult {
  /** True when the charge code belongs to this package. */
  readonly inPackage: boolean;
  /** Units covered by the package inclusion (recognised). */
  readonly consumed: number;
  /** Units beyond the inclusion — to be billed separately (charge capture, 5.5). */
  readonly extra: number;
  /** Value of the extra units at the component's unit price (0 when not in package). */
  readonly extraAmountFils: number;
}
export interface ComponentRecognition {
  readonly chargeCode: string;
  readonly includedQuantity: number;
  readonly consumedQuantity: number;
  readonly remainingQuantity: number;
  /** Recognised value delivered so far (consumed × unit). */
  readonly recognisedFils: number;
}

/**
 * Packages & cycle bundles (docs/01 §E11, ADR-0037). A package is versioned
 * config; selling it instantiates a per-component recognition ledger on the
 * patient and raises the package-price invoice (via BillingService — same
 * module). Charge capture recognises usage against the inclusion and reports any
 * excess to bill. Money is integer fils; recognition logic is 100% covered.
 */
export class PackageService {
  constructor(
    private readonly store: PackageStore,
    private readonly billing: BillingService,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  /** Define (or re-version) a package. A new definition starts at version 1. */
  async definePackage(actorId: string, input: PackageInput): Promise<Result<Package, AppError>> {
    const v = validatePackage(input);
    if (!v.ok) return err(v.error);
    const pkg: Package = {
      id: newId<"Package">(),
      code: input.code,
      name: input.name,
      version: 1,
      components: input.components.map((c) => ({ chargeCode: c.chargeCode, description: c.description, includedQuantity: c.includedQuantity, unitAmountFils: c.unitAmountFils })),
      priceFils: input.priceFils,
      active: true,
    };
    await this.store.savePackage(pkg);
    await this.audit.record({ actorId, entityType: "Package", entityId: pkg.id, action: "CREATE", after: { code: pkg.code, components: pkg.components.length, priceFils: pkg.priceFils } });
    await this.events.emit({ type: "PackageDefined", aggregateType: "Package", aggregateId: pkg.id, data: { code: pkg.code } });
    return ok(pkg);
  }

  /** Activate/deactivate a package definition (deactivated packages can't be sold). */
  async setPackageActive(actorId: string, packageId: string, active: boolean): Promise<Result<Package, AppError>> {
    const pkg = await this.store.getPackage(asId<"Package">(packageId));
    if (pkg === null) return err(notFound("package not found", "billing.package.not_found"));
    const updated: Package = { ...pkg, active };
    await this.store.savePackage(updated);
    await this.audit.record({ actorId, entityType: "Package", entityId: pkg.id, action: "UPDATE", after: { active } });
    return ok(updated);
  }

  /** Cancel a sold patient package (no further recognition). */
  async cancelPatientPackage(actorId: string, patientPackageId: string): Promise<Result<PatientPackage, AppError>> {
    const pp = await this.store.getPatientPackage(asId<"PatientPackage">(patientPackageId));
    if (pp === null) return err(notFound("patient package not found", "billing.patient_package.not_found"));
    const updated: PatientPackage = { ...pp, status: "cancelled" };
    await this.store.savePatientPackage(updated);
    await this.audit.record({ actorId, entityType: "PatientPackage", entityId: pp.id, action: "UPDATE", after: { status: "cancelled" } });
    return ok(updated);
  }

  /** Sell a package to a patient: snapshot its components (consumed 0), raise the
   *  package-price invoice, and record the patient package. */
  async sellPackage(actorId: string, patientId: string, packageId: string): Promise<Result<SellResult, AppError>> {
    const pkg = await this.store.getPackage(asId<"Package">(packageId));
    if (pkg === null) return err(notFound("package not found", "billing.package.not_found"));
    if (!pkg.active) return err(validationError("package is not active", "billing.package.inactive"));

    const inv = await this.billing.createInvoice(actorId, patientId, [
      { chargeCode: pkg.code, description: pkg.name, unitAmountFils: pkg.priceFils, quantity: 1 },
    ]);
    if (!inv.ok) return err(inv.error);

    const components: PatientPackageComponent[] = pkg.components.map((c) => ({ ...c, consumedQuantity: 0 }));
    const pp: PatientPackage = {
      id: newId<"PatientPackage">(),
      packageId: pkg.id,
      packageVersion: pkg.version,
      patientId,
      priceFils: pkg.priceFils,
      invoiceId: inv.value.id,
      components,
      status: "active",
      soldAt: this.clock.now().toISOString(),
    };
    await this.store.savePatientPackage(pp);
    await this.audit.record({ actorId, entityType: "PatientPackage", entityId: pp.id, action: "CREATE", after: { packageId: pkg.id, patientId, invoiceId: inv.value.id } });
    await this.events.emit({ type: "PackageSold", aggregateType: "PatientPackage", aggregateId: pp.id, data: { packageId: pkg.id, patientId } });
    return ok({ patientPackage: pp, invoiceId: inv.value.id });
  }

  /** Recognise a delivered charge against the package inclusion. Consumes from the
   *  matching component's remaining inclusion; reports any excess to bill (5.5). A
   *  charge code not in the package is entirely "extra". */
  async captureCharge(actorId: string, patientPackageId: string, chargeCode: string, quantity: number): Promise<Result<CaptureResult, AppError>> {
    if (!Number.isInteger(quantity) || quantity < 1) return err(validationError("quantity must be a positive whole number", "billing.bad_quantity"));
    const pp = await this.store.getPatientPackage(asId<"PatientPackage">(patientPackageId));
    if (pp === null) return err(notFound("patient package not found", "billing.patient_package.not_found"));
    if (pp.status !== "active") return err(validationError("patient package is not active", "billing.patient_package.inactive"));

    const idx = pp.components.findIndex((c) => c.chargeCode === chargeCode);
    if (idx === -1) {
      return ok({ inPackage: false, consumed: 0, extra: quantity, extraAmountFils: 0 });
    }
    const comp = pp.components[idx]!;
    const r = recognise(comp.includedQuantity, comp.consumedQuantity, quantity);
    const updated: PatientPackageComponent = { ...comp, consumedQuantity: comp.consumedQuantity + r.consumed };
    const components = pp.components.map((c, i) => (i === idx ? updated : c));
    await this.store.savePatientPackage({ ...pp, components });
    await this.audit.record({ actorId, entityType: "PatientPackage", entityId: pp.id, action: "UPDATE", after: { chargeCode, consumed: r.consumed, extra: r.extra } });
    return ok({ inPackage: true, consumed: r.consumed, extra: r.extra, extraAmountFils: r.extra * comp.unitAmountFils });
  }

  /** Per-component recognition (included / consumed / remaining / recognised value). */
  async recognitionReport(patientPackageId: string): Promise<Result<readonly ComponentRecognition[], AppError>> {
    const pp = await this.store.getPatientPackage(asId<"PatientPackage">(patientPackageId));
    if (pp === null) return err(notFound("patient package not found", "billing.patient_package.not_found"));
    return ok(pp.components.map((c) => ({
      chargeCode: c.chargeCode,
      includedQuantity: c.includedQuantity,
      consumedQuantity: c.consumedQuantity,
      remainingQuantity: Math.max(0, c.includedQuantity - c.consumedQuantity),
      recognisedFils: c.consumedQuantity * c.unitAmountFils,
    })));
  }

  listPackages(): Promise<readonly Package[]> {
    return this.store.packages();
  }
  packageById(id: PackageId): Promise<Package | null> {
    return this.store.getPackage(id);
  }
  patientPackageById(id: PatientPackageId): Promise<PatientPackage | null> {
    return this.store.getPatientPackage(id);
  }
}
