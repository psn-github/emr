-- Advanced sperm tests (docs/01 §E5 P1): DNA fragmentation + other advanced
-- assays, interpreted against configured thresholds. Additive only (forward-only,
-- docs/PATIENT-DATA.md): a config table + a results table, no changes to existing.

CREATE TABLE IF NOT EXISTS andrology.advanced_test_spec (
  code                text PRIMARY KEY,
  name_ar             text NOT NULL,
  name_en             text NOT NULL,
  unit                text NOT NULL,
  direction           text NOT NULL,
  normal_threshold    double precision NOT NULL,
  borderline_threshold double precision NOT NULL,
  active              boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS andrology.advanced_sperm_test (
  id             text PRIMARY KEY,
  patient_id     text NOT NULL,
  code           text NOT NULL,
  value          double precision NOT NULL,
  unit           text NOT NULL,
  interpretation text NOT NULL,
  method         text,
  performed_by   text NOT NULL,
  performed_at   timestamptz NOT NULL,
  note           text
);

CREATE INDEX IF NOT EXISTS advanced_sperm_test_patient_idx ON andrology.advanced_sperm_test (patient_id);
