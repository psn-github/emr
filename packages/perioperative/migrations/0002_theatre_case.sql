-- 0002_theatre_case — two-theatre case scheduling (docs/01 §E7). The theatre +
-- staff are held on the shared scheduling calendar (appointment_ref); each case
-- provisionally reserves an L2 bed for its day. Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.theatre_case (
  id                   text PRIMARY KEY,
  patient_id           text NOT NULL,
  encounter_id         text,
  procedure            text NOT NULL,
  theatre_resource_id  text NOT NULL,
  surgeon_resource_id  text NOT NULL,
  support_resource_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment            jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_date       date NOT NULL,
  start                timestamptz NOT NULL,
  end_at               timestamptz NOT NULL,
  status               text NOT NULL,
  appointment_ref      text NOT NULL
);
CREATE INDEX IF NOT EXISTS theatre_case_date_idx ON perioperative.theatre_case (scheduled_date);
