-- 0001_embryology — IVF laboratory records (docs/01 §E4). Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable. Witnessing is NOT stored here —
-- it lives in the witnessing schema, reconciled against RI Witness.

CREATE SCHEMA IF NOT EXISTS embryology;

CREATE TABLE IF NOT EXISTS embryology.oocyte (
  id                     text PRIMARY KEY,
  cycle_id               text NOT NULL,
  retrieval_procedure_id text NOT NULL,
  maturity               text NOT NULL,
  dish                   text NOT NULL,
  position               text NOT NULL,
  recorded_by            text NOT NULL
);
CREATE INDEX IF NOT EXISTS oocyte_cycle_idx ON embryology.oocyte (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.insemination (
  id              text PRIMARY KEY,
  cycle_id        text NOT NULL,
  oocyte_id       text NOT NULL,
  method          text NOT NULL,
  sperm_source_id text NOT NULL,
  operator        text NOT NULL,
  inseminated_at  timestamptz NOT NULL,
  witness_key     text NOT NULL
);
CREATE INDEX IF NOT EXISTS insemination_cycle_idx ON embryology.insemination (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.fertilisation_check (
  id          text PRIMARY KEY,
  cycle_id    text NOT NULL,
  oocyte_id   text NOT NULL,
  pn          text NOT NULL,
  checked_at  timestamptz NOT NULL,
  recorded_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS fert_check_cycle_idx ON embryology.fertilisation_check (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.embryo (
  id         text PRIMARY KEY,
  cycle_id   text NOT NULL,
  oocyte_id  text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS embryo_cycle_idx ON embryology.embryo (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.grading_entry (
  id          text PRIMARY KEY,
  embryo_id   text NOT NULL,
  day         integer NOT NULL,
  morphology  text NOT NULL,
  gardner     jsonb,
  recorded_by text NOT NULL,
  assessed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS grading_embryo_idx ON embryology.grading_entry (embryo_id);

CREATE TABLE IF NOT EXISTS embryology.disposition (
  id          text PRIMARY KEY,
  embryo_id   text NOT NULL,
  cycle_id    text NOT NULL,
  type        text NOT NULL,
  occurred_at timestamptz NOT NULL,
  operator    text NOT NULL,
  witness_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS disposition_cycle_idx ON embryology.disposition (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.embryo_transfer (
  id                text PRIMARY KEY,
  cycle_id          text NOT NULL,
  embryo_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  count             integer NOT NULL,
  catheter          text NOT NULL,
  difficulty        text NOT NULL,
  ultrasound_guided boolean NOT NULL,
  procedure_ref     text,
  operator          text NOT NULL,
  transferred_at    timestamptz NOT NULL,
  witness_key       text NOT NULL
);
CREATE INDEX IF NOT EXISTS transfer_cycle_idx ON embryology.embryo_transfer (cycle_id);
