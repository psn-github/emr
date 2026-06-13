-- 0001_clinical — clinical EMR core. Forward-only, additive (ADR-0008). All PHI.
-- Notes keep full version history (jsonb array; append-only). IF NOT EXISTS keeps
-- it re-runnable for dev/test.

CREATE SCHEMA IF NOT EXISTS clinical;

CREATE TABLE IF NOT EXISTS clinical.encounter (
  id              text PRIMARY KEY,
  patient_id      text NOT NULL,
  type            text NOT NULL,
  practitioner_id text NOT NULL,
  status          text NOT NULL DEFAULT 'open',
  opened_at       timestamptz NOT NULL,
  closed_at       timestamptz
);

CREATE TABLE IF NOT EXISTS clinical.clinical_note (
  id           text PRIMARY KEY,
  encounter_id text NOT NULL,
  patient_id   text NOT NULL,
  versions     jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS clinical_note_patient_idx ON clinical.clinical_note (patient_id);

CREATE TABLE IF NOT EXISTS clinical.clinical_order (
  id           text PRIMARY KEY,
  encounter_id text NOT NULL,
  patient_id   text NOT NULL,
  kind         text NOT NULL,
  code         text NOT NULL,
  status       text NOT NULL DEFAULT 'ordered',
  ordered_by   text NOT NULL,
  at           timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical.result (
  id              text PRIMARY KEY,
  order_id        text NOT NULL,
  patient_id      text NOT NULL,
  summary         text NOT NULL,
  abnormal        boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'unacknowledged',
  filed_at        timestamptz NOT NULL,
  acknowledged_by text
);
CREATE INDEX IF NOT EXISTS result_status_idx ON clinical.result (status);

CREATE TABLE IF NOT EXISTS clinical.letter (
  id           text PRIMARY KEY,
  patient_id   text NOT NULL,
  template_key text NOT NULL,
  locale       text NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'draft',
  signed_by    text,
  signed_at    timestamptz
);
