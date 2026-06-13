// Drizzle schema for the `scheduling` domain (ADR-0008). Appointment types +
// resources are config; appointments reference patients (PHI) by logical id.
import { pgSchema, integer, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";

export const schedulingSchema = pgSchema("scheduling");

export const resource = schedulingSchema.table("resource", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  level: text("level"),
  locationRef: text("location_ref"),
});

export const appointmentType = schedulingSchema.table("appointment_type", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  durationMin: integer("duration_min").notNull(),
  requiredResourceKinds: jsonb("required_resource_kinds").$type<string[]>().notNull().default([]),
  prepAr: text("prep_ar"),
  prepEn: text("prep_en"),
  defaultBillingItem: text("default_billing_item"),
});

export const appointment = schedulingSchema.table(
  "appointment",
  {
    id: text("id").primaryKey(),
    typeId: text("type_id").notNull(),
    patientId: text("patient_id").notNull(),
    practitionerId: text("practitioner_id").notNull(),
    resourceIds: jsonb("resource_ids").$type<string[]>().notNull().default([]),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    cancellationReason: text("cancellation_reason"),
  },
  (t) => ({ byPatient: index("appointment_patient_idx").on(t.patientId), byStart: index("appointment_start_idx").on(t.startAt) }),
);
