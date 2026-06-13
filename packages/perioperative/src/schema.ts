// Drizzle schema for the `perioperative` domain (docs/01 §E7). The encounter ties
// the surgical journey together; bed/floor movements live in the facility schema
// (ADR-0023) — not duplicated here.
import { pgSchema, text, timestamp, index } from "drizzle-orm/pg-core";

export const perioperativeSchema = pgSchema("perioperative");

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
