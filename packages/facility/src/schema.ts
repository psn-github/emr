// Drizzle schema for the `facility` domain (ADR-0008). Locations/beds are config
// data with bilingual names. Bed status drives the flow board.
import { pgSchema, integer, text } from "drizzle-orm/pg-core";

export const facilitySchema = pgSchema("facility");

export const floor = facilitySchema.table("floor", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

export const locationNode = facilitySchema.table("location_node", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),
  type: text("type").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  capacity: integer("capacity").notNull().default(1),
});

export const bed = facilitySchema.table("bed", {
  id: text("id").primaryKey(),
  locationNodeId: text("location_node_id").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("free"),
});
