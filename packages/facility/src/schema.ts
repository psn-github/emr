// Drizzle schema for the `facility` domain (ADR-0008). Locations/beds are config
// data with bilingual names. Bed status drives the flow board. Patient-location
// + movement are PHI (who is where); movement is append-only history.
import { pgSchema, integer, text, timestamp, index } from "drizzle-orm/pg-core";

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

/** A patient's CURRENT location (one row per patient; PHI). */
export const patientLocation = facilitySchema.table("patient_location", {
  patientId: text("patient_id").primaryKey(),
  locationNodeId: text("location_node_id").notNull(),
  bedId: text("bed_id"),
  status: text("status").notNull(),
  sinceAt: timestamp("since_at", { withTimezone: true }).notNull(),
});

/** Append-only history of transfers between location nodes (PHI). */
export const locationMovement = facilitySchema.table(
  "location_movement",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    fromNodeId: text("from_node_id"),
    toNodeId: text("to_node_id").notNull(),
    bedId: text("bed_id"),
    status: text("status").notNull(),
    movedBy: text("moved_by").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
  },
  (t) => ({ byPatient: index("location_movement_patient_idx").on(t.patientId) }),
);
