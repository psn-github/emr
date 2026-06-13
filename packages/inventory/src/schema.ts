// Drizzle schema for the `inventory` domain (docs/01 §E9).
import { pgSchema, text, integer, bigserial, boolean, doublePrecision, date, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const inventorySchema = pgSchema("inventory");

export const stockLot = inventorySchema.table(
  "stock_lot",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    lotNo: text("lot_no").notNull(),
    locationId: text("location_id").notNull(),
    quantity: integer("quantity").notNull(),
    expiryDate: date("expiry_date").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byItem: index("stock_lot_item_idx").on(t.itemId) }),
);

export const requisition = inventorySchema.table("requisition", {
  id: text("id").primaryKey(),
  lines: jsonb("lines").$type<{ itemId: string; quantity: number }[]>().notNull().default([]),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
});

export const purchaseOrder = inventorySchema.table("purchase_order", {
  id: text("id").primaryKey(),
  requisitionId: text("requisition_id"),
  supplierId: text("supplier_id").notNull(),
  lines: jsonb("lines").$type<{ itemId: string; quantity: number; unitPriceFils: number }[]>().notNull().default([]),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const goodsReceipt = inventorySchema.table(
  "goods_receipt",
  {
    id: text("id").primaryKey(),
    poId: text("po_id").notNull(),
    lines: jsonb("lines").$type<unknown[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    receivedBy: text("received_by").notNull(),
  },
  (t) => ({ byPo: index("goods_receipt_po_idx").on(t.poId) }),
);

export const supplierInvoice = inventorySchema.table(
  "supplier_invoice",
  {
    id: text("id").primaryKey(),
    poId: text("po_id").notNull(),
    lines: jsonb("lines").$type<unknown[]>().notNull().default([]),
    totalFils: integer("total_fils").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPo: index("supplier_invoice_po_idx").on(t.poId) }),
);

export const cdMovement = inventorySchema.table(
  "cd_movement",
  {
    id: text("id").primaryKey(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    itemId: text("item_id").notNull(),
    lotNo: text("lot_no").notNull(),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull(),
    patientRef: text("patient_ref"),
    actorId: text("actor_id").notNull(),
    witnessedBy: text("witnessed_by").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byItem: index("cd_movement_item_idx").on(t.itemId) }),
);

export const coldChainReading = inventorySchema.table(
  "cold_chain_reading",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id").notNull(),
    temperatureC: doublePrecision("temperature_c").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byLocation: index("cold_chain_location_idx").on(t.locationId) }),
);

export const supplier = inventorySchema.table("supplier", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  active: boolean("active").notNull().default(true),
});

export const catalogueItem = inventorySchema.table("catalogue_item", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  packSize: integer("pack_size").notNull(),
  coldChain: boolean("cold_chain").notNull().default(false),
  controlled: boolean("controlled").notNull().default(false),
  parLevel: integer("par_level").notNull().default(0),
  preferredSupplierId: text("preferred_supplier_id"),
});
