// Drizzle schema for the `billing` domain (ADR-0008). Money is integer fils.
// Invoice lines are jsonb; payments are append-only (no row is ever deleted —
// refunds/voids are Phase 5 and are themselves recorded entries, never deletes).
import { pgSchema, bigint, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";

export const billingSchema = pgSchema("billing");

export const invoice = billingSchema.table(
  "invoice",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    currency: text("currency").notNull().default("KWD"),
    lines: jsonb("lines").notNull().default([]),
    // tax_rate_bps column retained in the DB (additive-only migrations) but UNUSED:
    // there is no tax in Kuwait (ADR-0035). Not mapped into the domain model.
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPatient: index("invoice_patient_idx").on(t.patientId) }),
);

export const payment = billingSchema.table(
  "payment",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    kind: text("kind").notNull().default("payment"),
    amountFils: bigint("amount_fils", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    takenBy: text("taken_by").notNull(),
    receiptNo: text("receipt_no").notNull(),
    reason: text("reason").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byInvoice: index("payment_invoice_idx").on(t.invoiceId) }),
);
