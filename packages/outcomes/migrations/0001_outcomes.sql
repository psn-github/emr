-- 0001_outcomes — the fertility → pregnancy → live-birth continuum (docs/01
-- §E3 outcome stage). Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it
-- re-runnable. Each record links back to the originating cycle by cycle_id.

CREATE SCHEMA IF NOT EXISTS outcomes;

CREATE TABLE IF NOT EXISTS outcomes.pregnancy_test (
  id              text PRIMARY KEY,
  cycle_id        text NOT NULL,
  beta_hcg_miu_ml double precision NOT NULL,
  result          text NOT NULL,
  tested_at       timestamptz NOT NULL,
  recorded_by     text NOT NULL
);
CREATE INDEX IF NOT EXISTS pregnancy_test_cycle_idx ON outcomes.pregnancy_test (cycle_id);

CREATE TABLE IF NOT EXISTS outcomes.clinical_assessment (
  id                 text PRIMARY KEY,
  cycle_id           text NOT NULL,
  gestational_sacs   integer NOT NULL,
  fetal_heartbeats   integer NOT NULL,
  clinical_pregnancy boolean NOT NULL,
  assessed_at        timestamptz NOT NULL,
  recorded_by        text NOT NULL
);
CREATE INDEX IF NOT EXISTS clinical_assessment_cycle_idx ON outcomes.clinical_assessment (cycle_id);

CREATE TABLE IF NOT EXISTS outcomes.pregnancy_outcome (
  id                   text PRIMARY KEY,
  cycle_id             text NOT NULL,
  type                 text NOT NULL,
  live_birth_count     integer NOT NULL,
  gestational_age_weeks double precision,
  occurred_at          timestamptz NOT NULL,
  note                 text,
  recorded_by          text NOT NULL
);
CREATE INDEX IF NOT EXISTS pregnancy_outcome_cycle_idx ON outcomes.pregnancy_outcome (cycle_id);
