-- 0001_andrology — WHO 6th-ed semen analysis, sperm prep, witnessed freeze
-- (with cryostore link) and surgical retrieval (docs/01 §E5). Forward-only,
-- additive (ADR-0008); IF NOT EXISTS keeps it re-runnable. Witnessing lives in
-- the witnessing schema, reconciled against RI Witness.

CREATE SCHEMA IF NOT EXISTS andrology;

CREATE TABLE IF NOT EXISTS andrology.semen_analysis (
  id                   text PRIMARY KEY,
  patient_id           text NOT NULL,
  collected_at         timestamptz NOT NULL,
  parameters           jsonb NOT NULL,
  flags                jsonb NOT NULL,
  all_within_reference boolean NOT NULL,
  recorded_by          text NOT NULL
);
CREATE INDEX IF NOT EXISTS semen_analysis_patient_idx ON andrology.semen_analysis (patient_id);

CREATE TABLE IF NOT EXISTS andrology.sperm_prep (
  id                              text PRIMARY KEY,
  patient_id                      text NOT NULL,
  method                          text NOT NULL,
  post_prep_concentration         double precision NOT NULL,
  post_prep_progressive_motility  double precision NOT NULL,
  prepared_by                     text NOT NULL,
  prepared_at                     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sperm_prep_patient_idx ON andrology.sperm_prep (patient_id);

CREATE TABLE IF NOT EXISTS andrology.sperm_freeze (
  id                text PRIMARY KEY,
  patient_id        text NOT NULL,
  cryo_specimen_ref text NOT NULL,
  straws            integer NOT NULL,
  frozen_by         text NOT NULL,
  frozen_at         timestamptz NOT NULL,
  witness_key       text NOT NULL
);
CREATE INDEX IF NOT EXISTS sperm_freeze_patient_idx ON andrology.sperm_freeze (patient_id);

CREATE TABLE IF NOT EXISTS andrology.surgical_retrieval (
  id                  text PRIMARY KEY,
  patient_id          text NOT NULL,
  method              text NOT NULL,
  theatre_booking_ref text NOT NULL,
  sperm_found         boolean NOT NULL,
  performed_by        text NOT NULL,
  performed_at        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS surgical_retrieval_patient_idx ON andrology.surgical_retrieval (patient_id);
