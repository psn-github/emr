-- 0003_billing_packages — packages & cycle bundles (docs/01 §E11, ADR-0037). A
-- `package` is the versioned config bundle of components (jsonb); a
-- `patient_package` is a sold instance carrying the per-component recognition
-- ledger (jsonb) and the package-price invoice it raised. Money is integer fils.
-- Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS billing.package (
  id         text PRIMARY KEY,
  code       text NOT NULL,
  name       jsonb NOT NULL,
  version    bigint NOT NULL DEFAULT 1,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_fils bigint NOT NULL,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS billing.patient_package (
  id              text PRIMARY KEY,
  package_id      text NOT NULL,
  package_version bigint NOT NULL,
  patient_id      text NOT NULL,
  price_fils      bigint NOT NULL,
  invoice_id      text NOT NULL,
  components      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'active',
  sold_at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_package_patient_idx ON billing.patient_package (patient_id);
