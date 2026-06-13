-- 0006_recovery — recovery (L1) + post-op ward (L2) observations and the
-- discharge follow-up booking (docs/01 §E7). Discharge from L2 is gated on a
-- fulfilled prescription (pharmacy) + a follow-up here. Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.observation (
  id            text PRIMARY KEY,
  encounter_id  text NOT NULL,
  phase         text NOT NULL,
  aldrete_score integer,
  systolic_bp   integer NOT NULL,
  heart_rate    integer NOT NULL,
  spo2          integer NOT NULL,
  notes         text NOT NULL,
  recorded_at   timestamptz NOT NULL,
  recorded_by   text NOT NULL
);
CREATE INDEX IF NOT EXISTS observation_encounter_idx ON perioperative.observation (encounter_id);

CREATE TABLE IF NOT EXISTS perioperative.follow_up (
  encounter_id  text PRIMARY KEY,
  id            text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  booked_by     text NOT NULL,
  booked_at     timestamptz NOT NULL
);
