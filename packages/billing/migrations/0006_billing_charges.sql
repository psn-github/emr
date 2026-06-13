-- 0006_billing_charges — item-level charge capture (docs/01 §E11). A charge_master
-- prices charge codes (no free-text charges, formulary discipline); captured
-- charges (from clinical/lab/theatre/pharmacy events) are recorded against a
-- patient, recognised against a package where applicable, and later batched into
-- an invoice. Money is integer fils. Forward-only, additive (ADR-0008).

CREATE TABLE IF NOT EXISTS billing.charge_master (
  code             text PRIMARY KEY,
  description      jsonb NOT NULL,
  unit_amount_fils bigint NOT NULL,
  active           boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS billing.charge (
  id                 text PRIMARY KEY,
  patient_id         text NOT NULL,
  charge_code        text NOT NULL,
  description        jsonb NOT NULL,
  quantity           bigint NOT NULL,
  unit_amount_fils   bigint NOT NULL,
  source             text NOT NULL,
  occurred_at        timestamptz NOT NULL,
  recognised         boolean NOT NULL DEFAULT false,
  patient_package_id text,
  invoice_id         text
);
CREATE INDEX IF NOT EXISTS charge_patient_idx ON billing.charge (patient_id);
