// Drizzle schema for the `inventory` domain (docs/01 §E9).
import { pgSchema, text, integer, boolean, doublePrecision, date, timestamp, index } from "drizzle-orm/pg-core";

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
