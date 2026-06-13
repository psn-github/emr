-- 0001_consent — consent-gated partner access (docs/01 §E13, ADR-0042). A patient
-- grants another person READ access to their portal data; revocable + audited.
-- Append-only (revoke sets revoked_at; rows are never deleted). Forward-only,
-- additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS consent;

CREATE TABLE IF NOT EXISTS consent.partner_access_grant (
  id         text PRIMARY KEY,
  patient_id text NOT NULL,
  partner_id text NOT NULL,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS partner_access_patient_idx ON consent.partner_access_grant (patient_id);
CREATE INDEX IF NOT EXISTS partner_access_partner_idx ON consent.partner_access_grant (partner_id);
