import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Supplier, SupplierId, CatalogueItem, CatalogueItemId } from "./types.js";
import type { CatalogueStore } from "./store.js";

/** Postgres-backed CatalogueStore. */
export class PgCatalogueStore implements CatalogueStore {
  constructor(private readonly pool: Pool) {}

  async saveSupplier(s: Supplier): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.supplier (id, name, contact_email, contact_phone, active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, contact_email=EXCLUDED.contact_email, contact_phone=EXCLUDED.contact_phone, active=EXCLUDED.active`,
      [s.id, s.name, s.contactEmail, s.contactPhone, s.active],
    );
  }
  async suppliers(): Promise<readonly Supplier[]> {
    const r = await this.pool.query<SupRow>("SELECT * FROM inventory.supplier ORDER BY name");
    return r.rows.map(supFrom);
  }
  async getSupplier(id: SupplierId): Promise<Supplier | undefined> {
    const r = await this.pool.query<SupRow>("SELECT * FROM inventory.supplier WHERE id = $1", [id]);
    return r.rows[0] ? supFrom(r.rows[0]) : undefined;
  }
  async saveItem(i: CatalogueItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.catalogue_item (id, name, category, unit, pack_size, cold_chain, controlled, par_level, preferred_supplier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, unit=EXCLUDED.unit, pack_size=EXCLUDED.pack_size, cold_chain=EXCLUDED.cold_chain, controlled=EXCLUDED.controlled, par_level=EXCLUDED.par_level, preferred_supplier_id=EXCLUDED.preferred_supplier_id`,
      [i.id, i.name, i.category, i.unit, i.packSize, i.coldChain, i.controlled, i.parLevel, i.preferredSupplierId],
    );
  }
  async items(): Promise<readonly CatalogueItem[]> {
    const r = await this.pool.query<ItemRow>("SELECT * FROM inventory.catalogue_item ORDER BY name");
    return r.rows.map(itemFrom);
  }
  async getItem(id: CatalogueItemId): Promise<CatalogueItem | undefined> {
    const r = await this.pool.query<ItemRow>("SELECT * FROM inventory.catalogue_item WHERE id = $1", [id]);
    return r.rows[0] ? itemFrom(r.rows[0]) : undefined;
  }
}

interface SupRow { id: string; name: string; contact_email: string | null; contact_phone: string | null; active: boolean }
interface ItemRow { id: string; name: string; category: string; unit: string; pack_size: number; cold_chain: boolean; controlled: boolean; par_level: number; preferred_supplier_id: string | null }

function supFrom(r: SupRow): Supplier {
  return { id: asId<"Supplier">(r.id), name: r.name, contactEmail: r.contact_email, contactPhone: r.contact_phone, active: r.active };
}
function itemFrom(r: ItemRow): CatalogueItem {
  return { id: asId<"CatalogueItem">(r.id), name: r.name, category: r.category as CatalogueItem["category"], unit: r.unit, packSize: r.pack_size, coldChain: r.cold_chain, controlled: r.controlled, parLevel: r.par_level, preferredSupplierId: r.preferred_supplier_id };
}
