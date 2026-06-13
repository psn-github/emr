-- 0004_who_checklist — WHO Surgical Safety Checklist (docs/01 §E7), one row per
-- encounter; each phase is a jsonb PhaseRecord (null until completed). Blocking
-- + audited. Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.who_checklist (
  encounter_id text PRIMARY KEY,
  sign_in      jsonb,
  time_out     jsonb,
  sign_out     jsonb
);
