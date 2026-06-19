-- Coded drug-allergy list (docs/01 §E8: prescribing checks allergies; ADR-0060).
-- Additive, forward-only. Append-only / soft-delete: allergies are retired
-- (active=false), never hard-deleted. Matched by drug-class code for an ADVISORY
-- warning at prescribe time (never a block).
CREATE TABLE IF NOT EXISTS clinical.drug_allergy (
  id            text PRIMARY KEY,
  patient_id    text NOT NULL,
  drug_class    text NOT NULL,
  substance_ar  text NOT NULL,
  substance_en  text NOT NULL,
  severity      text NOT NULL,
  reaction      text,
  recorded_by   text NOT NULL,
  recorded_at   timestamptz NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  retired_by    text,
  retired_at    timestamptz
);
CREATE INDEX IF NOT EXISTS drug_allergy_patient_idx ON clinical.drug_allergy (patient_id);
