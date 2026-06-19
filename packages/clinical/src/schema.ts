// Drizzle schema for the `clinical` domain (ADR-0008). All PHI. Notes keep full
// version history (jsonb array of versions — append-only). "order" is a SQL
// keyword, so the table is `clinical_order`.
import { pgSchema, boolean, jsonb, text, timestamp, index, integer, numeric, date } from "drizzle-orm/pg-core";

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

/** Clinical pathways / order sets (versioned config; bilingual; items as JSON). */
export const orderSet = clinicalSchema.table("order_set", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  items: jsonb("items").$type<{ kind: string; code: string; label: { ar: string; en: string } }[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
});

/** Antenatal record (docs/01 §E2 P1): a dated pregnancy with booking data + EDD. */
export const pregnancy = clinicalSchema.table(
  "pregnancy",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    lmp: date("lmp").notNull(),
    edd: date("edd").notNull(),
    gravida: integer("gravida").notNull(),
    para: integer("para").notNull(),
    riskFactors: jsonb("risk_factors").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    bookedBy: text("booked_by").notNull(),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPatient: index("pregnancy_patient_idx").on(t.patientId) }),
);

/** Coded drug-allergy list (docs/01 §E8, ADR-0060). Append-only / soft-delete
 *  (active flag); matched by drug-class code at prescribe time for an advisory. */
export const drugAllergy = clinicalSchema.table(
  "drug_allergy",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    drugClass: text("drug_class").notNull(),
    substanceAr: text("substance_ar").notNull(),
    substanceEn: text("substance_en").notNull(),
    severity: text("severity").notNull(),
    reaction: text("reaction"),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    retiredBy: text("retired_by"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => ({ byPatient: index("drug_allergy_patient_idx").on(t.patientId) }),
);

/** Serial antenatal visits: vitals + growth + derived risk flags. */
export const antenatalVisit = clinicalSchema.table(
  "antenatal_visit",
  {
    id: text("id").primaryKey(),
    pregnancyId: text("pregnancy_id").notNull(),
    patientId: text("patient_id").notNull(),
    visitAt: timestamp("visit_at", { withTimezone: true }).notNull(),
    gestationWeeks: integer("gestation_weeks").notNull(),
    bpSystolic: integer("bp_systolic").notNull(),
    bpDiastolic: integer("bp_diastolic").notNull(),
    fundalHeightCm: numeric("fundal_height_cm"),
    proteinuria: boolean("proteinuria").notNull().default(false),
    presentation: text("presentation"),
    fetalHeartRate: integer("fetal_heart_rate"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byPregnancy: index("antenatal_visit_pregnancy_idx").on(t.pregnancyId) }),
);
