// Drizzle schema for the `clinical` domain (ADR-0008). All PHI. Notes keep full
// version history (jsonb array of versions — append-only). "order" is a SQL
// keyword, so the table is `clinical_order`.
import { pgSchema, boolean, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";

export const clinicalSchema = pgSchema("clinical");

export const encounter = clinicalSchema.table("encounter", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  type: text("type").notNull(),
  practitionerId: text("practitioner_id").notNull(),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const clinicalNote = clinicalSchema.table(
  "clinical_note",
  {
    id: text("id").primaryKey(),
    encounterId: text("encounter_id").notNull(),
    patientId: text("patient_id").notNull(),
    versions: jsonb("versions").notNull().default([]),
  },
  (t) => ({ byPatient: index("clinical_note_patient_idx").on(t.patientId) }),
);

export const clinicalOrder = clinicalSchema.table("clinical_order", {
  id: text("id").primaryKey(),
  encounterId: text("encounter_id").notNull(),
  patientId: text("patient_id").notNull(),
  kind: text("kind").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull().default("ordered"),
  orderedBy: text("ordered_by").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

export const result = clinicalSchema.table(
  "result",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    patientId: text("patient_id").notNull(),
    summary: text("summary").notNull(),
    abnormal: boolean("abnormal").notNull().default(false),
    status: text("status").notNull().default("unacknowledged"),
    filedAt: timestamp("filed_at", { withTimezone: true }).notNull(),
    acknowledgedBy: text("acknowledged_by"),
    releasedToPatient: boolean("released_to_patient").notNull().default(false),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by"),
  },
  (t) => ({ byStatus: index("result_status_idx").on(t.status), byPatient: index("result_patient_idx").on(t.patientId) }),
);

export const letter = clinicalSchema.table("letter", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  templateKey: text("template_key").notNull(),
  locale: text("locale").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
});
