// @oxford/inventory — Operations ERP (docs/01 §E9–E10). Domain module: core +
// audit. Catalogue first; multi-location stock, procurement, controlled-drugs
// register, and assets land in subsequent Phase 4 PRs. Wired behind the Phase-3
// InventoryPort seam (ADR-0026) for theatre consumable deduction.
export type { SupplierId, CatalogueItemId, ItemCategory, Supplier, CatalogueItem } from "./types.js";
export { validateCatalogueItem, type CatalogueItemInput } from "./catalogue.js";
export { type CatalogueStore, InMemoryCatalogueStore } from "./store.js";
export { PgCatalogueStore } from "./pg-store.js";
export { CatalogueService, type AddSupplierInput, type AddItemInput } from "./catalogue-service.js";
export { inventorySchema, supplier, catalogueItem } from "./schema.js";
