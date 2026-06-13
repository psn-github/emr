-- 0001_hr — light HR (docs/01 §E14, ADR-0040): staff registry, MOH licence +
-- competency records (with expiry), and rota shifts feeding scheduling
-- availability. Full payroll stays external. Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.staff (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  role            text NOT NULL,
  professional_id text,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS hr.credential (
  id         text PRIMARY KEY,
  staff_id   text NOT NULL,
  type       text NOT NULL,
  name       text NOT NULL,
  authority  text,
  issued_at  timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS credential_staff_idx ON hr.credential (staff_id);

CREATE TABLE IF NOT EXISTS hr.shift (
  id          text PRIMARY KEY,
  staff_id    text NOT NULL,
  resource_id text NOT NULL,
  start       timestamptz NOT NULL,
  "end"       timestamptz NOT NULL,
  role        text NOT NULL
);
CREATE INDEX IF NOT EXISTS shift_resource_idx ON hr.shift (resource_id);
