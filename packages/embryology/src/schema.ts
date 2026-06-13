// Drizzle schema for the `embryology` domain (docs/01 §E4). Lab records only —
// witnessing lives in the witnessing schema, reconciled against RI Witness.
import { pgSchema, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import type { GardnerGrade } from "./types.js";

export const embryologySchema = pgSchema("embryology");

export const oocyte = embryologySchema.table(
  "oocyte",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    retrievalProcedureId: text("retrieval_procedure_id").notNull(),
    maturity: text("maturity").notNull(),
    dish: text("dish").notNull(),
    position: text("position").notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("oocyte_cycle_idx").on(t.cycleId) }),
);

export const insemination = embryologySchema.table(
  "insemination",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    oocyteId: text("oocyte_id").notNull(),
    method: text("method").notNull(),
    spermSourceId: text("sperm_source_id").notNull(),
    operator: text("operator").notNull(),
    inseminatedAt: timestamp("inseminated_at", { withTimezone: true }).notNull(),
    witnessKey: text("witness_key").notNull(),
  },
  (t) => ({ byCycle: index("insemination_cycle_idx").on(t.cycleId) }),
);

export const fertilisationCheck = embryologySchema.table(
  "fertilisation_check",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    oocyteId: text("oocyte_id").notNull(),
    pn: text("pn").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("fert_check_cycle_idx").on(t.cycleId) }),
);

export const embryo = embryologySchema.table(
  "embryo",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    oocyteId: text("oocyte_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byCycle: index("embryo_cycle_idx").on(t.cycleId) }),
);

export const gradingEntry = embryologySchema.table(
  "grading_entry",
  {
    id: text("id").primaryKey(),
    embryoId: text("embryo_id").notNull(),
    day: integer("day").notNull(),
    morphology: text("morphology").notNull(),
    gardner: jsonb("gardner").$type<GardnerGrade | null>(),
    recordedBy: text("recorded_by").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byEmbryo: index("grading_embryo_idx").on(t.embryoId) }),
);

export const disposition = embryologySchema.table(
  "disposition",
  {
    id: text("id").primaryKey(),
    embryoId: text("embryo_id").notNull(),
    cycleId: text("cycle_id").notNull(),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    operator: text("operator").notNull(),
    witnessKey: text("witness_key").notNull(),
  },
  (t) => ({ byCycle: index("disposition_cycle_idx").on(t.cycleId) }),
);

export const mediaApplication = embryologySchema.table(
  "media_application",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    embryoId: text("embryo_id"),
    oocyteId: text("oocyte_id"),
    itemId: text("item_id").notNull(),
    lotNo: text("lot_no").notNull(),
    step: text("step").notNull(),
    quantity: integer("quantity").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
    operator: text("operator").notNull(),
  },
  (t) => ({
    byLot: index("media_application_lot_idx").on(t.itemId, t.lotNo),
    byCycle: index("media_application_cycle_idx").on(t.cycleId),
  }),
);

export const pgtOrder = embryologySchema.table(
  "pgt_order",
  {
    id: text("id").primaryKey(),
    embryoId: text("embryo_id").notNull(),
    cycleId: text("cycle_id").notNull(),
    type: text("type").notNull(),
    indication: text("indication").notNull(),
    consentDocumentRef: text("consent_document_ref").notNull(),
    orderedBy: text("ordered_by").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byCycle: index("pgt_order_cycle_idx").on(t.cycleId) }),
);

export const pgtResult = embryologySchema.table(
  "pgt_result",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    embryoId: text("embryo_id").notNull(),
    status: text("status").notNull(),
    reportRef: text("report_ref").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byOrder: index("pgt_result_order_idx").on(t.orderId) }),
);

export const embryoTransfer = embryologySchema.table(
  "embryo_transfer",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    embryoIds: jsonb("embryo_ids").$type<string[]>().notNull().default([]),
    count: integer("count").notNull(),
    catheter: text("catheter").notNull(),
    difficulty: text("difficulty").notNull(),
    ultrasoundGuided: boolean("ultrasound_guided").notNull(),
    procedureRef: text("procedure_ref"),
    operator: text("operator").notNull(),
    transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(),
    witnessKey: text("witness_key").notNull(),
  },
  (t) => ({ byCycle: index("transfer_cycle_idx").on(t.cycleId) }),
);
