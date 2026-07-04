-- 0002_pharmacy_theatre — external pharmacy + in-house theatre drugs (ADR-0069,
-- supersedes the dispensing model of ADR-0066). Forward-only, additive (ADR-0008);
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS keep it re-runnable. No destruction path
-- — clinical/drug records are append-only/soft-state, so there is deliberately no
-- DROP/DELETE anywhere. The 0001 `dispense` table is left in place (never dropped);
-- the prescription flow no longer decrements clinic stock.

-- Prescriptions gain an external-fulfilment reference + note: the audited handover
-- confirmation recorded by ward/reception staff when the EXTERNAL Ground-floor
-- pharmacy has supplied. No inventory/controlled-register writes on this path.
ALTER TABLE pharmacy.prescription ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE pharmacy.prescription ADD COLUMN IF NOT EXISTS fulfilment_note text;

-- The clinic's own in-house drug stock use in theatre (anaesthetic + controlled,
-- L1): each administration decrements theatre stock (FEFO/lot via inventory's
-- published interface) and, for controlled drugs, posts a witnessed movement to the
-- controlled-drugs register. Items + lot allocations stored as immutable jsonb.
-- Append-only.
CREATE TABLE IF NOT EXISTS pharmacy.theatre_drug_administration (
  id                 text PRIMARY KEY,
  seq                bigint GENERATED ALWAYS AS IDENTITY,
  encounter_id       text NOT NULL,
  patient_id         text NOT NULL,
  administered_by    text NOT NULL,
  items              jsonb NOT NULL,
  allocations        jsonb NOT NULL,
  cold_chain_handled boolean NOT NULL DEFAULT false,
  witness_staff_id   text,
  location_id        text NOT NULL,
  administered_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS theatre_admin_encounter_idx ON pharmacy.theatre_drug_administration (encounter_id, seq);
CREATE INDEX IF NOT EXISTS theatre_admin_patient_idx ON pharmacy.theatre_drug_administration (patient_id);
