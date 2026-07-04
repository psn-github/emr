// Drizzle schema for the `pharmacy` domain (ADR-0066/0069). Two record kinds:
//   • prescription — the ward's outstanding-scripts queue; the clinic issues a
//     formulary-only prescription that the EXTERNAL pharmacy fulfils (status text;
//     no clinic stock movement). Allergy advisories + external-fulfilment reference
//     as columns.
//   • theatre_drug_administration — the clinic's own in-house drug stock use in
//     theatre (anaesthetic + controlled); lot allocations as jsonb.
// `seq` gives the queue a deterministic oldest-first order. Append-only/soft-state —
// no destruction path.
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
    externalRef: text("external_ref"),
    fulfilmentNote: text("fulfilment_note"),
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

export const theatreDrugAdministration = pharmacySchema.table(
  "theatre_drug_administration",
  {
    id: text("id").primaryKey(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    encounterId: text("encounter_id").notNull(),
    patientId: text("patient_id").notNull(),
    administeredBy: text("administered_by").notNull(),
    items: jsonb("items").notNull(),
    allocations: jsonb("allocations").notNull(),
    coldChainHandled: boolean("cold_chain_handled").notNull().default(false),
    witnessStaffId: text("witness_staff_id"),
    locationId: text("location_id").notNull(),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byEncounter: index("theatre_admin_encounter_idx").on(t.encounterId, t.seq),
    byPatient: index("theatre_admin_patient_idx").on(t.patientId),
  }),
);
