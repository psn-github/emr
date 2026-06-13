// Drizzle schema for the `perioperative` domain (docs/01 §E7). The encounter ties
// the surgical journey together; bed/floor movements live in the facility schema
// (ADR-0023) — not duplicated here.
import { pgSchema, text, date, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const perioperativeSchema = pgSchema("perioperative");

export const theatreCase = perioperativeSchema.table(
  "theatre_case",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id"),
    procedure: text("procedure").notNull(),
    theatreResourceId: text("theatre_resource_id").notNull(),
    surgeonResourceId: text("surgeon_resource_id").notNull(),
    supportResourceIds: jsonb("support_resource_ids").$type<string[]>().notNull().default([]),
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    scheduledDate: date("scheduled_date").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    appointmentRef: text("appointment_ref").notNull(),
  },
  (t) => ({ byDate: index("theatre_case_date_idx").on(t.scheduledDate) }),
);

export const surgicalEncounter = perioperativeSchema.table(
  "surgical_encounter",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    indication: text("indication").notNull(),
    stage: text("stage").notNull(),
    theatreCaseRef: text("theatre_case_ref"),
    admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull(),
    cancellationReason: text("cancellation_reason"),
  },
  (t) => ({ byPatient: index("surgical_encounter_patient_idx").on(t.patientId) }),
);
