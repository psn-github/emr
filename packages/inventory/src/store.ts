import type { Supplier, SupplierId, CatalogueItem, CatalogueItemId } from "./types.js";

export interface CatalogueStore {
  saveSupplier(s: Supplier): Promise<void>;
  suppliers(): Promise<readonly Supplier[]>;
  getSupplier(id: SupplierId): Promise<Supplier | undefined>;
  saveItem(i: CatalogueItem): Promise<void>;
  items(): Promise<readonly CatalogueItem[]>;
  getItem(id: CatalogueItemId): Promise<CatalogueItem | undefined>;
}

export class InMemoryCatalogueStore implements CatalogueStore {
  private readonly supplierList: Supplier[] = [];
  private readonly itemList: CatalogueItem[] = [];

  async saveSupplier(s: Supplier): Promise<void> {
    const idx = this.supplierList.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.supplierList[idx] = s;
    else this.supplierList.push(s);
  }
  async suppliers(): Promise<readonly Supplier[]> {
    return this.supplierList;
  }
  async getSupplier(id: SupplierId): Promise<Supplier | undefined> {
    return this.supplierList.find((s) => s.id === id);
  }
  async saveItem(i: CatalogueItem): Promise<void> {
    const idx = this.itemList.findIndex((x) => x.id === i.id);
    if (idx >= 0) this.itemList[idx] = i;
    else this.itemList.push(i);
  }
  async items(): Promise<readonly CatalogueItem[]> {
    return this.itemList;
  }
  async getItem(id: CatalogueItemId): Promise<CatalogueItem | undefined> {
    return this.itemList.find((i) => i.id === id);
  }
}
