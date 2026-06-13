-- 0001_perioperative — SurgicalEncounter tying the perioperative journey
-- together (docs/01 §E7). Bed/floor movements live in the facility schema
-- (ADR-0023). Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it
-- re-runnable.

CREATE SCHEMA IF NOT EXISTS perioperative;

CREATE TABLE IF NOT EXISTS perioperative.surgical_encounter (
  id                  text PRIMARY KEY,
  patient_id          text NOT NULL,
  indication          text NOT NULL,
  stage               text NOT NULL,
  theatre_case_ref    text,
  admitted_at         timestamptz NOT NULL,
  cancellation_reason text
);
CREATE INDEX IF NOT EXISTS surgical_encounter_patient_idx ON perioperative.surgical_encounter (patient_id);
