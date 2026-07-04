-- 0001_pharmacy — Ground-floor dispensing (docs/PHASE8_PLAN §8.1, ADR-0066): the
-- prescription queue and lot-traced dispenses. Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable. No destruction path — clinical/drug records
-- are append-only/soft-state, so there is deliberately no DROP/DELETE anywhere.

CREATE SCHEMA IF NOT EXISTS pharmacy;

-- A prescription raised by a clinician for a patient (optionally the discharge
-- encounter). Items are FORMULARY-ONLY (validated in the service via the
-- FormularyPort) and stored as an immutable jsonb snapshot; allergy advisories
-- (ADR-0060) are recorded on the row, never blocking. `seq` orders the queue.
CREATE TABLE IF NOT EXISTS pharmacy.prescription (
  id               text PRIMARY KEY,
  seq              bigint GENERATED ALWAYS AS IDENTITY,
  patient_id       text NOT NULL,
  encounter_id     text,
  prescriber_id    text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  items            jsonb NOT NULL,
  allergy_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancel_reason    text,
  raised_at        timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS prescription_patient_idx ON pharmacy.prescription (patient_id);
CREATE INDEX IF NOT EXISTS prescription_encounter_idx ON pharmacy.prescription (encounter_id);
CREATE INDEX IF NOT EXISTS prescription_status_seq_idx ON pharmacy.prescription (status, seq);

-- A dispense: the lot allocations (jsonb: drug/lot/expiry/quantity) consumed from
-- inventory (FEFO), the cold-chain-handled assertion, and the second-person
-- witness for controlled items. Append-only.
CREATE TABLE IF NOT EXISTS pharmacy.dispense (
  id                 text PRIMARY KEY,
  seq                bigint GENERATED ALWAYS AS IDENTITY,
  prescription_id    text NOT NULL,
  dispensed_by       text NOT NULL,
  allocations        jsonb NOT NULL,
  cold_chain_handled boolean NOT NULL DEFAULT false,
  witness_staff_id   text,
  dispensed_at       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS dispense_prescription_idx ON pharmacy.dispense (prescription_id, seq);
