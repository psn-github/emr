// Drizzle schema for the `outcomes` domain (docs/01 §E3 outcome stage). Each
// record links back to the originating cycle by cycle_id.
import { pgSchema, text, integer, doublePrecision, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const outcomesSchema = pgSchema("outcomes");

export const pregnancyTest = outcomesSchema.table(
  "pregnancy_test",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    betaHcgMiuMl: doublePrecision("beta_hcg_miu_ml").notNull(),
    result: text("result").notNull(),
    testedAt: timestamp("tested_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("pregnancy_test_cycle_idx").on(t.cycleId) }),
);

export const clinicalAssessment = outcomesSchema.table(
  "clinical_assessment",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    gestationalSacs: integer("gestational_sacs").notNull(),
    fetalHeartbeats: integer("fetal_heartbeats").notNull(),
    clinicalPregnancy: boolean("clinical_pregnancy").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("clinical_assessment_cycle_idx").on(t.cycleId) }),
);

export const pregnancyOutcome = outcomesSchema.table(
  "pregnancy_outcome",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    type: text("type").notNull(),
    liveBirthCount: integer("live_birth_count").notNull(),
    gestationalAgeWeeks: doublePrecision("gestational_age_weeks"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("pregnancy_outcome_cycle_idx").on(t.cycleId) }),
);
