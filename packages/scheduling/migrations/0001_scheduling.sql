-- 0001_scheduling — bookable resources, appointment types (config), and
-- appointments. Forward-only, additive (ADR-0008). Appointments reference the
-- patient by logical id (PHI). IF NOT EXISTS keeps it re-runnable for dev/test.

CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE IF NOT EXISTS scheduling.resource (
  id           text PRIMARY KEY,
  kind         text NOT NULL,
  name_ar      text NOT NULL,
  name_en      text NOT NULL,
  level        text,
  location_ref text
);

CREATE TABLE IF NOT EXISTS scheduling.appointment_type (
  id                      text PRIMARY KEY,
  name_ar                 text NOT NULL,
  name_en                 text NOT NULL,
  duration_min            integer NOT NULL,
  required_resource_kinds jsonb NOT NULL DEFAULT '[]'::jsonb,
  prep_ar                 text,
  prep_en                 text,
  default_billing_item    text
);

CREATE TABLE IF NOT EXISTS scheduling.appointment (
  id                  text PRIMARY KEY,
  type_id             text NOT NULL,
  patient_id          text NOT NULL,
  practitioner_id     text NOT NULL,
  resource_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'booked',
  cancellation_reason text
);
CREATE INDEX IF NOT EXISTS appointment_patient_idx ON scheduling.appointment (patient_id);
CREATE INDEX IF NOT EXISTS appointment_start_idx ON scheduling.appointment (start_at);
