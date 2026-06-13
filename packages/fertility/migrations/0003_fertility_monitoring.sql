-- 0003_fertility_monitoring — monitoring-visit workflow + procedures.
-- Forward-only, additive (ADR-0008). IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS fertility.monitoring_visit (
  id            text PRIMARY KEY,
  cycle_id      text NOT NULL,
  visit_at      timestamptz NOT NULL,
  decision      text NOT NULL,
  note          text,
  next_visit_at timestamptz,
  recorded_by   text NOT NULL
);
CREATE INDEX IF NOT EXISTS monitoring_visit_cycle_idx ON fertility.monitoring_visit (cycle_id);

CREATE TABLE IF NOT EXISTS fertility.procedure (
  id                  text PRIMARY KEY,
  cycle_id            text NOT NULL,
  type                text NOT NULL,
  scheduled_at        timestamptz NOT NULL,
  theatre_booking_ref text
);
CREATE INDEX IF NOT EXISTS procedure_cycle_idx ON fertility.procedure (cycle_id);
