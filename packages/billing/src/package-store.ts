import type { Package, PackageId, PatientPackage, PatientPackageId } from "./types.js";

export interface PackageStore {
  savePackage(p: Package): Promise<void>;
  getPackage(id: PackageId): Promise<Package | null>;
  packages(): Promise<readonly Package[]>;
  savePatientPackage(pp: PatientPackage): Promise<void>;
  getPatientPackage(id: PatientPackageId): Promise<PatientPackage | null>;
}

export class InMemoryPackageStore implements PackageStore {
  private readonly defs = new Map<string, Package>();
  private readonly sold = new Map<string, PatientPackage>();

  async savePackage(p: Package): Promise<void> {
    this.defs.set(p.id, p);
  }
  async getPackage(id: PackageId): Promise<Package | null> {
    return this.defs.get(id) ?? null;
  }
  async packages(): Promise<readonly Package[]> {
    return [...this.defs.values()];
  }
  async savePatientPackage(pp: PatientPackage): Promise<void> {
    this.sold.set(pp.id, pp);
  }
  async getPatientPackage(id: PatientPackageId): Promise<PatientPackage | null> {
    return this.sold.get(id) ?? null;
  }
}
