// Drizzle schema for the `pharmacy` domain (ADR-0066): the dispensing queue.
// Prescriptions (formulary-only items + allergy advisories as jsonb) and lot-
// traced dispenses (allocations as jsonb). `seq` gives the queue a deterministic
// oldest-first order. Append-only/soft-state — no destruction path.
import { pgSchema, text, boolean, jsonb, bigint, timestamp, index } from "drizzle-orm/pg-core";

export const pharmacySchema = pgSchema("pharmacy");

export const prescription = pharmacySchema.table(
  "prescription",
  {
    id: text("id").primaryKey(),
    // Monotonic insertion order — the queue's deterministic oldest-first key.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id"),
    prescriberId: text("prescriber_id").notNull(),
    status: text("status").notNull().default("pending"),
    items: jsonb("items").notNull(),
    allergyWarnings: jsonb("allergy_warnings").notNull().default([]),
    cancelReason: text("cancel_reason"),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byPatient: index("prescription_patient_idx").on(t.patientId),
    byEncounter: index("prescription_encounter_idx").on(t.encounterId),
    byStatusSeq: index("prescription_status_seq_idx").on(t.status, t.seq),
  }),
);

export const dispense = pharmacySchema.table(
  "dispense",
  {
    id: text("id").primaryKey(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    prescriptionId: text("prescription_id").notNull(),
    dispensedBy: text("dispensed_by").notNull(),
    allocations: jsonb("allocations").notNull(),
    coldChainHandled: boolean("cold_chain_handled").notNull().default(false),
    witnessStaffId: text("witness_staff_id"),
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPrescription: index("dispense_prescription_idx").on(t.prescriptionId, t.seq) }),
);
