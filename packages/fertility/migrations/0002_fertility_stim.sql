-- 0002_fertility_stim — stimulation chart (day-by-day grid). Forward-only,
-- additive (ADR-0008). Drug doses are validated against the controlled formulary
-- (no free text). IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS fertility.stim_day (
  id             text PRIMARY KEY,
  cycle_id       text NOT NULL,
  day            integer NOT NULL,
  drugs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  follicles      jsonb NOT NULL DEFAULT '[]'::jsonb,
  endometrium_mm integer,
  endocrine      jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by    text NOT NULL,
  at             timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS stim_day_cycle_day_uq ON fertility.stim_day (cycle_id, day);
