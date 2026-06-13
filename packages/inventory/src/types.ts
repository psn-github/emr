import type { Id } from "@oxford/core";

// Operations ERP types (docs/01 §E9). The catalogue is the foundation: suppliers
// and items (consumables, media, drugs, lab kit, office) with units, pack sizes,
// and cold-chain/controlled attributes. Configuration — extend without code change.

export type SupplierId = Id<"Supplier">;
export type CatalogueItemId = Id<"CatalogueItem">;

export type ItemCategory = "consumable" | "media" | "drug" | "lab_kit" | "office";

export interface Supplier {
  readonly id: SupplierId;
  readonly name: string;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly active: boolean;
}

export interface CatalogueItem {
  readonly id: CatalogueItemId;
  readonly name: string;
  readonly category: ItemCategory;
  /** Issue/stock unit (e.g. "vial", "straw", "box"). */
  readonly unit: string;
  /** Units per received pack (a positive integer). */
  readonly packSize: number;
  readonly coldChain: boolean;
  /** A controlled substance — movements go to the controlled-drugs register. */
  readonly controlled: boolean;
  /** Reorder (par) level in stock units; a critical-stock alert fires below it. */
  readonly parLevel: number;
  readonly preferredSupplierId: string | null;
}
