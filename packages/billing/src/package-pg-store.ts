import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Package, PackageId, PackageComponent, PatientPackage, PatientPackageId, PatientPackageComponent, BilingualText } from "./types.js";
import type { PackageStore } from "./package-store.js";

/** Postgres-backed PackageStore. Money is integer fils; components are jsonb. */
export class PgPackageStore implements PackageStore {
  constructor(private readonly pool: Pool) {}

  async savePackage(p: Package): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.package (id, code, name, version, components, price_fils, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET components=EXCLUDED.components, price_fils=EXCLUDED.price_fils, active=EXCLUDED.active, version=EXCLUDED.version`,
      [p.id, p.code, JSON.stringify(p.name), p.version, JSON.stringify(p.components), p.priceFils, p.active],
    );
  }
  async getPackage(id: PackageId): Promise<Package | null> {
    const r = await this.pool.query<PkgRow>("SELECT * FROM billing.package WHERE id = $1", [id]);
    return r.rows[0] ? pkgFrom(r.rows[0]) : null;
  }
  async packages(): Promise<readonly Package[]> {
    const r = await this.pool.query<PkgRow>("SELECT * FROM billing.package ORDER BY code");
    return r.rows.map(pkgFrom);
  }
  async savePatientPackage(pp: PatientPackage): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.patient_package (id, package_id, package_version, patient_id, price_fils, invoice_id, components, status, sold_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET components=EXCLUDED.components, status=EXCLUDED.status`,
      [pp.id, pp.packageId, pp.packageVersion, pp.patientId, pp.priceFils, pp.invoiceId, JSON.stringify(pp.components), pp.status, pp.soldAt],
    );
  }
  async getPatientPackage(id: PatientPackageId): Promise<PatientPackage | null> {
    const r = await this.pool.query<PpRow>("SELECT * FROM billing.patient_package WHERE id = $1", [id]);
    return r.rows[0] ? ppFrom(r.rows[0]) : null;
  }
}

interface PkgRow { id: string; code: string; name: BilingualText; version: string | number; components: PackageComponent[]; price_fils: string | number; active: boolean }
interface PpRow { id: string; package_id: string; package_version: string | number; patient_id: string; price_fils: string | number; invoice_id: string; components: PatientPackageComponent[]; status: string; sold_at: Date }

function pkgFrom(r: PkgRow): Package {
  return { id: asId<"Package">(r.id), code: r.code, name: r.name, version: Number(r.version), components: r.components, priceFils: Number(r.price_fils), active: r.active };
}
function ppFrom(r: PpRow): PatientPackage {
  return { id: asId<"PatientPackage">(r.id), packageId: r.package_id, packageVersion: Number(r.package_version), patientId: r.patient_id, priceFils: Number(r.price_fils), invoiceId: r.invoice_id, components: r.components, status: r.status as PatientPackage["status"], soldAt: new Date(r.sold_at).toISOString() };
}
