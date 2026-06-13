-- 0007_cssd — CSSD / instrument-set tracking (docs/01 §E7): set composition,
-- sterilisation cycles, and which set was used on which patient (traceability).
-- Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.instrument_set (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  composition jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL
);

CREATE TABLE IF NOT EXISTS perioperative.sterilisation_cycle (
  id           text PRIMARY KEY,
  set_id       text NOT NULL,
  cycle_type   text NOT NULL,
  load_ref     text NOT NULL,
  result       text NOT NULL,
  completed_at timestamptz NOT NULL,
  operator     text NOT NULL
);
CREATE INDEX IF NOT EXISTS sterilisation_cycle_set_idx ON perioperative.sterilisation_cycle (set_id);

CREATE TABLE IF NOT EXISTS perioperative.set_usage (
  id                     text PRIMARY KEY,
  set_id                 text NOT NULL,
  encounter_id           text NOT NULL,
  sterilisation_cycle_id text NOT NULL,
  used_at                timestamptz NOT NULL,
  used_by                text NOT NULL
);
CREATE INDEX IF NOT EXISTS set_usage_set_idx ON perioperative.set_usage (set_id);
CREATE INDEX IF NOT EXISTS set_usage_encounter_idx ON perioperative.set_usage (encounter_id);
