// @oxford/inventory — Operations ERP (docs/01 §E9–E10). Domain module: core +
// audit. Catalogue first; multi-location stock, procurement, controlled-drugs
// register, and assets land in subsequent Phase 4 PRs. Wired behind the Phase-3
// InventoryPort seam (ADR-0026) for theatre consumable deduction.
export type { SupplierId, CatalogueItemId, ItemCategory, Supplier, CatalogueItem, StockLotId, StockLot, ColdChainReadingId, ColdChainReading } from "./types.js";
export { validateCatalogueItem, type CatalogueItemInput } from "./catalogue.js";
export { planFefoIssue, isExpired, isExpiringWithin, belowPar, type IssuableLot, type IssuePlanLine } from "./stock.js";
export { type CatalogueStore, InMemoryCatalogueStore } from "./store.js";
export { PgCatalogueStore } from "./pg-store.js";
export { type StockStore, InMemoryStockStore } from "./stock-store.js";
export { PgStockStore } from "./stock-pg-store.js";
export { CatalogueService, type AddSupplierInput, type AddItemInput } from "./catalogue-service.js";
export {
  InventoryService,
  type ReceiveInput,
  type IssueInput,
  type DeductItem,
  type StockAlerts,
  type CriticalStockAlert,
  type ExpiryAlert,
} from "./inventory-service.js";
export { inventorySchema, supplier, catalogueItem, stockLot, coldChainReading } from "./schema.js";
