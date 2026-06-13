-- 0003_preop_assessment — pre-operative assessment (docs/01 §E7): anaesthetic
-- history, airway (Mallampati), ASA grade, investigations, fasting, consent.
-- One per encounter. Forward-only, additive (ADR-0008); IF NOT EXISTS re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.preop_assessment (
  id                  text PRIMARY KEY,
  encounter_id        text NOT NULL UNIQUE,
  anaesthetic_history text NOT NULL,
  mallampati_class    integer NOT NULL,
  asa_grade           integer NOT NULL,
  investigations      jsonb NOT NULL DEFAULT '[]'::jsonb,
  fasting_confirmed   boolean NOT NULL,
  consent_ref         text NOT NULL,
  assessed_by         text NOT NULL,
  assessed_at         timestamptz NOT NULL
);
