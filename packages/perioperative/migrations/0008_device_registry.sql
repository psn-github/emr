-- Implant/device registry reporting (docs/01 §E7 P2). Additive only (forward-only,
-- docs/PATIENT-DATA.md): add patient_id to consumable_use for implant traceability
-- (NOT NULL DEFAULT '' so existing rows are safe), index it + (code, lot) for recall
-- lookups, and add the (config) device catalogue.

ALTER TABLE perioperative.consumable_use ADD COLUMN IF NOT EXISTS patient_id text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS consumable_use_patient_idx ON perioperative.consumable_use (patient_id);
CREATE INDEX IF NOT EXISTS consumable_use_code_lot_idx ON perioperative.consumable_use (code, lot_no);

CREATE TABLE IF NOT EXISTS perioperative.device_catalogue (
  code         text PRIMARY KEY,
  name_ar      text NOT NULL,
  name_en      text NOT NULL,
  device_type  text NOT NULL,
  manufacturer text NOT NULL,
  active       boolean NOT NULL DEFAULT true
);
