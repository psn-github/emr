// Drizzle schema for the `inventory` domain (docs/01 §E9) — catalogue first.
import { pgSchema, text, integer, boolean } from "drizzle-orm/pg-core";

export const inventorySchema = pgSchema("inventory");

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
