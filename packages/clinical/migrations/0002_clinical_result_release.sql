-- 0002_clinical_result_release — clinician-gated result release to the patient
-- portal (docs/01 §E13, ADR-0042). A result is invisible to the patient until a
-- clinician releases it. Forward-only, additive (ADR-0008); IF NOT EXISTS keeps
-- it re-runnable.

ALTER TABLE clinical.result ADD COLUMN IF NOT EXISTS released_to_patient boolean NOT NULL DEFAULT false;
ALTER TABLE clinical.result ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE clinical.result ADD COLUMN IF NOT EXISTS released_by text;
CREATE INDEX IF NOT EXISTS result_patient_idx ON clinical.result (patient_id);
