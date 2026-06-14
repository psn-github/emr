-- Practitioner leave (docs/01 §E2 P1): leave periods override the rota so an
-- on-leave practitioner is unavailable. Additive only (forward-only,
-- docs/PATIENT-DATA.md): one new table, no changes to existing ones.

CREATE TABLE IF NOT EXISTS hr.leave (
  id       text PRIMARY KEY,
  staff_id text NOT NULL,
  type     text NOT NULL,
  start    timestamptz NOT NULL,
  "end"    timestamptz NOT NULL,
  note     text
);

CREATE INDEX IF NOT EXISTS leave_staff_idx ON hr.leave (staff_id);
