// @oxford/inventory — Operations ERP (docs/01 §E9–E10). Domain module: core +
// audit. Catalogue first; multi-location stock, procurement, controlled-drugs
// register, and assets land in subsequent Phase 4 PRs. Wired behind the Phase-3
// InventoryPort seam (ADR-0026) for theatre consumable deduction.
export type { SupplierId, CatalogueItemId, ItemCategory, Supplier, CatalogueItem, StockLotId, StockLot, ColdChainReadingId, ColdChainReading } from "./types.js";
export { validateCatalogueItem, type CatalogueItemInput } from "./catalogue.js";
export { planFefoIssue, isExpired, isExpiringWithin, belowPar, type IssuableLot, type IssuePlanLine } from "./stock.js";
export { decideRequisition, threeWayMatch, type ThreeWayLine, type MatchResult, type Discrepancy, type DiscrepancyKind, type RequisitionStatus } from "./procurement.js";
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
export type { RequisitionId, Requisition, RequisitionLine, PurchaseOrderId, PurchaseOrder, PurchaseOrderLine, GoodsReceiptId, GoodsReceipt, GoodsReceiptLine, SupplierInvoiceId, SupplierInvoice, SupplierInvoiceLine } from "./types.js";
export { type ProcurementStore, InMemoryProcurementStore } from "./procurement-store.js";
export { PgProcurementStore } from "./procurement-pg-store.js";
export { ProcurementService, type CreatePoInput, type ReceiveGoodsInput, type RecordInvoiceInput } from "./procurement-service.js";
export { newBalance, validateWitness, reconcile, movementDirection, type CdMovementType, type Reconciliation } from "./controlled.js";
export type { CdMovementId, CdMovement } from "./types.js";
export { type ControlledRegisterStore, InMemoryControlledRegisterStore } from "./controlled-store.js";
export { PgControlledRegisterStore } from "./controlled-pg-store.js";
export { ControlledDrugsService, type RecordMovementInput, type ReconcileInput, type PeriodReportRow } from "./controlled-service.js";
export { inventorySchema, supplier, catalogueItem, stockLot, coldChainReading, requisition, purchaseOrder, goodsReceipt, supplierInvoice, cdMovement } from "./schema.js";
