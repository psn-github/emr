-- Cycle templates (docs/01 §E3 P1) — config-as-data for one-step cycle starts.
-- Additive only: a new config table (forward-only, docs/PATIENT-DATA.md).

CREATE TABLE IF NOT EXISTS fertility.cycle_template (
  id             text PRIMARY KEY,
  name_ar        text NOT NULL,
  name_en        text NOT NULL,
  cycle_type     text NOT NULL,
  protocol_id    text,
  owner_staff_id text,         -- null = clinic-wide template
  active         boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS cycle_template_owner_idx ON fertility.cycle_template (owner_staff_id);
