// Drizzle schema for the `andrology` domain (docs/01 §E5). Semen analysis stores
// the measured parameters + computed flags; freeze carries the cryostore link
// and witness key (reconciled against RI Witness in the witnessing schema).
import { pgSchema, text, integer, doublePrecision, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import type { SemenParameters, SemenFlags } from "./types.js";

export const andrologySchema = pgSchema("andrology");

export const semenAnalysis = andrologySchema.table(
  "semen_analysis",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    parameters: jsonb("parameters").$type<SemenParameters>().notNull(),
    flags: jsonb("flags").$type<SemenFlags>().notNull(),
    allWithinReference: boolean("all_within_reference").notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byPatient: index("semen_analysis_patient_idx").on(t.patientId) }),
);

export const spermPrep = andrologySchema.table(
  "sperm_prep",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    method: text("method").notNull(),
    postPrepConcentration: doublePrecision("post_prep_concentration").notNull(),
    postPrepProgressiveMotility: doublePrecision("post_prep_progressive_motility").notNull(),
    preparedBy: text("prepared_by").notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPatient: index("sperm_prep_patient_idx").on(t.patientId) }),
);

export const spermFreeze = andrologySchema.table(
  "sperm_freeze",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    cryoSpecimenRef: text("cryo_specimen_ref").notNull(),
    straws: integer("straws").notNull(),
    frozenBy: text("frozen_by").notNull(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull(),
    witnessKey: text("witness_key").notNull(),
  },
  (t) => ({ byPatient: index("sperm_freeze_patient_idx").on(t.patientId) }),
);

export const surgicalRetrieval = andrologySchema.table(
  "surgical_retrieval",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    method: text("method").notNull(),
    theatreBookingRef: text("theatre_booking_ref").notNull(),
    spermFound: boolean("sperm_found").notNull(),
    performedBy: text("performed_by").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPatient: index("surgical_retrieval_patient_idx").on(t.patientId) }),
);

/** Advanced sperm test specs (versioned config; bilingual; thresholds + direction). */
export const advancedTestSpec = andrologySchema.table("advanced_test_spec", {
  code: text("code").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  unit: text("unit").notNull(),
  direction: text("direction").notNull(),
  normalThreshold: doublePrecision("normal_threshold").notNull(),
  borderlineThreshold: doublePrecision("borderline_threshold").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Advanced sperm test results (DNA fragmentation etc.) with interpretation. */
export const advancedSpermTest = andrologySchema.table(
  "advanced_sperm_test",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    code: text("code").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    interpretation: text("interpretation").notNull(),
    method: text("method"),
    performedBy: text("performed_by").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    note: text("note"),
  },
  (t) => ({ byPatient: index("advanced_sperm_test_patient_idx").on(t.patientId) }),
);
