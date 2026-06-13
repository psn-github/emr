// Drizzle schema for the `witnessing` reconciliation ledger (ADR-0018). Oxford
// stores the handling events it observed and the append-only reconciliation
// rows against RI Witness. It never stores a "witness decision" of its own —
// RI Witness is authoritative.
import { pgSchema, text, timestamp, index } from "drizzle-orm/pg-core";

export const witnessingSchema = pgSchema("witnessing");

export const handlingEvent = witnessingSchema.table(
  "handling_event",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    stepKey: text("step_key").notNull(),
    oxfordKey: text("oxford_key").notNull(),
    patientId: text("patient_id").notNull(),
    sampleId: text("sample_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by").notNull(),
  },
  (t) => ({ byCycle: index("handling_event_cycle_idx").on(t.cycleId) }),
);

export const reconciliation = witnessingSchema.table(
  "reconciliation",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    handlingEventId: text("handling_event_id"),
    oxfordKey: text("oxford_key").notNull(),
    riRecordId: text("ri_record_id"),
    status: text("status").notNull(),
    reason: text("reason"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byCycle: index("reconciliation_cycle_idx").on(t.cycleId) }),
);
