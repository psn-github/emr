-- 0004_billing_instalments — deposits & instalment plans (docs/01 §E11, ADR-0038).
-- A plan pays down an invoice: a deposit plus dated instalments (jsonb) summing to
-- the invoice total. Cycle progression is gated on arrears (computed from the
-- invoice's net payments). Money is integer fils. Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS billing.instalment_plan (
  id           text PRIMARY KEY,
  patient_id   text NOT NULL,
  invoice_id   text NOT NULL,
  total_fils   bigint NOT NULL,
  deposit_fils bigint NOT NULL,
  instalments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS instalment_plan_patient_idx ON billing.instalment_plan (patient_id);
