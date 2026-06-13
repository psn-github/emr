-- 0001_fertility — cycle engine + protocols. Forward-only, additive (ADR-0008).
-- Owner is person OR couple (preservation vs treatment). Stimulation/dosing
-- tables arrive in PR 2.2. IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS fertility;

CREATE TABLE IF NOT EXISTS fertility.cycle (
  id                  text PRIMARY KEY,
  type                text NOT NULL,
  owner_kind          text NOT NULL,
  owner_id            text NOT NULL,
  protocol_id         text,
  status              text NOT NULL DEFAULT 'planned',
  signed_consents     jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancellation_reason text,
  created_at          timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cycle_owner_idx ON fertility.cycle (owner_id);

CREATE TABLE IF NOT EXISTS fertility.protocol (
  id         text PRIMARY KEY,
  name_ar    text NOT NULL,
  name_en    text NOT NULL,
  applies_to jsonb NOT NULL DEFAULT '[]'::jsonb
);
