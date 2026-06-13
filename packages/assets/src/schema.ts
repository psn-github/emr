// Drizzle schema for the `assets` domain (docs/01 §E10). Asset register +
// PPM/calibration records + fault/downtime log.
import { pgSchema, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const assetsSchema = pgSchema("assets");

export const asset = assetsSchema.table(
  "asset",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    locationId: text("location_id").notNull(),
    serialNumber: text("serial_number").notNull(),
    supplierId: text("supplier_id"),
    warrantyExpiry: text("warranty_expiry"),
    critical: boolean("critical").notNull().default(false),
    status: text("status").notNull().default("active"),
  },
  (t) => ({ byLocation: index("asset_location_idx").on(t.locationId) }),
);

export const maintenanceRecord = assetsSchema.table(
  "maintenance_record",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    type: text("type").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    performedBy: text("performed_by").notNull(),
    nextDueDate: timestamp("next_due_date", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
  },
  (t) => ({ byAsset: index("maintenance_asset_idx").on(t.assetId) }),
);

export const faultRecord = assetsSchema.table(
  "fault_record",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    reportedBy: text("reported_by").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    downtimeMinutes: integer("downtime_minutes"),
  },
  (t) => ({ byAsset: index("fault_asset_idx").on(t.assetId) }),
);
