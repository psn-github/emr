// Drizzle schema for the `perioperative` domain (docs/01 §E7). The encounter ties
// the surgical journey together; bed/floor movements live in the facility schema
// (ADR-0023) — not duplicated here.
import { pgSchema, text, integer, boolean, date, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const perioperativeSchema = pgSchema("perioperative");

export const intraOpRecord = perioperativeSchema.table("intraop_record", {
  id: text("id").primaryKey(),
  encounterId: text("encounter_id").notNull().unique(),
  procedurePerformed: text("procedure_performed").notNull(),
  findings: text("findings").notNull(),
  anaestheticTechnique: text("anaesthetic_technique").notNull(),
  drugs: jsonb("drugs").$type<{ formularyCode: string; dose: number; unit: string }[]>().notNull().default([]),
  staff: jsonb("staff").$type<string[]>().notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  recordedBy: text("recorded_by").notNull(),
});

export const consumableUse = perioperativeSchema.table(
  "consumable_use",
  {
    id: text("id").primaryKey(),
    encounterId: text("encounter_id").notNull(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    lotNo: text("lot_no").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceFils: integer("unit_price_fils").notNull(),
    invoiceRef: text("invoice_ref").notNull(),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byEncounter: index("consumable_use_encounter_idx").on(t.encounterId) }),
);

export const specimenRecord = perioperativeSchema.table(
  "specimen_record",
  {
    id: text("id").primaryKey(),
    encounterId: text("encounter_id").notNull(),
    type: text("type").notNull(),
    site: text("site").notNull(),
    lotRef: text("lot_ref").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byEncounter: index("specimen_record_encounter_idx").on(t.encounterId) }),
);

// WHO Surgical Safety Checklist — one row per encounter; each phase is a jsonb
// PhaseRecord (or null until completed).
export const whoChecklist = perioperativeSchema.table("who_checklist", {
  encounterId: text("encounter_id").primaryKey(),
  signIn: jsonb("sign_in"),
  timeOut: jsonb("time_out"),
  signOut: jsonb("sign_out"),
});

export const preOpAssessment = perioperativeSchema.table("preop_assessment", {
  id: text("id").primaryKey(),
  encounterId: text("encounter_id").notNull().unique(),
  anaestheticHistory: text("anaesthetic_history").notNull(),
  mallampatiClass: integer("mallampati_class").notNull(),
  asaGrade: integer("asa_grade").notNull(),
  investigations: jsonb("investigations").$type<string[]>().notNull().default([]),
  fastingConfirmed: boolean("fasting_confirmed").notNull(),
  consentRef: text("consent_ref").notNull(),
  assessedBy: text("assessed_by").notNull(),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
});

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
