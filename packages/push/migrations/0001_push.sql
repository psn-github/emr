-- 0001_push — web-push subscriptions for the PWA (docs/01 §E13, ADR-0041). Push
-- dispatch sends only discreet (no-PHI) prompts. Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS push;

CREATE TABLE IF NOT EXISTS push.push_subscription (
  id         text PRIMARY KEY,
  patient_id text NOT NULL,
  endpoint   text NOT NULL,
  locale     text NOT NULL,
  created_at timestamptz NOT NULL,
  active     boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS push_subscription_patient_idx ON push.push_subscription (patient_id);
