-- 0001_billing — basic invoicing & payments. Forward-only, additive (ADR-0008).
-- Money is integer fils. Payments are append-only (refunds/voids are Phase 5
-- recorded entries, never deletes). IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.invoice (
  id           text PRIMARY KEY,
  patient_id   text NOT NULL,
  currency     text NOT NULL DEFAULT 'KWD',
  lines        jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_rate_bps integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS invoice_patient_idx ON billing.invoice (patient_id);

CREATE TABLE IF NOT EXISTS billing.payment (
  id         text PRIMARY KEY,
  invoice_id text NOT NULL,
  amount_fils bigint NOT NULL,
  method     text NOT NULL,
  taken_by   text NOT NULL,
  receipt_no text NOT NULL,
  at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_invoice_idx ON billing.payment (invoice_id);
