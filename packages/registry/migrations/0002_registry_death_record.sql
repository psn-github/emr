-- 0002_registry_death_record — clinician-attested vital status (Medical Director
-- decision, 2026-06-13). The authoritative source for the cryostore
-- no-posthumous-use gate. Forward-only, additive (ADR-0008); IF NOT EXISTS keeps
-- it re-runnable. One record per person (person_id is the primary key).

CREATE TABLE IF NOT EXISTS registry.death_record (
  person_id     text PRIMARY KEY,
  id            text NOT NULL,
  date_of_death date NOT NULL,
  attested_by   text NOT NULL,
  document_ref  text NOT NULL,
  recorded_at   timestamptz NOT NULL
);
