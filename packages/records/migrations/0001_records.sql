-- 0001_records — paper medical records & filing (ADR-0065): MRN allocation
-- (per-year counter + assignments), the physical file registry (+ volumes), and
-- append-only file movements. Forward-only, additive (ADR-0008); IF NOT EXISTS
-- keeps it re-runnable. No destruction path — retention is an open legal item,
-- so there is deliberately no DROP/DELETE anywhere here (append-only/soft-state).

CREATE SCHEMA IF NOT EXISTS records;

-- Per-year MRN sequence. Numbers are unique and NEVER reused; the counter only
-- moves forward.
CREATE TABLE IF NOT EXISTS records.mrn_counter (
  year     integer PRIMARY KEY,
  next_seq integer NOT NULL
);

-- MRN assignment on a person (one MRN per person; one person per MRN).
-- `imported` marks a legacy (Cliniko-era) file number brought in verbatim.
CREATE TABLE IF NOT EXISTS records.mrn_assignment (
  mrn         text PRIMARY KEY,
  person_id   text NOT NULL UNIQUE,
  assigned_at timestamptz NOT NULL,
  imported    boolean NOT NULL DEFAULT false
);

-- The physical paper file (and later volumes). Status is active/archived/missing;
-- there is no destroyed state (retention open item — docs/03 §3).
CREATE TABLE IF NOT EXISTS records.patient_file (
  id               text PRIMARY KEY,
  person_id        text NOT NULL,
  mrn              text NOT NULL,
  volume           integer NOT NULL,
  home_location    text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  archive_location text,
  created_at       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS patient_file_person_idx ON records.patient_file (person_id);
CREATE INDEX IF NOT EXISTS patient_file_mrn_idx ON records.patient_file (mrn);

-- Append-only file movements (check_out / check_in / transfer), keyed by the
-- file's barcode scan; the file's current whereabouts is derived from the latest.
-- `seq` gives a monotonic, insertion-ordered tiebreaker so "the latest movement"
-- for a file is deterministic even when several movements share a timestamp
-- (the domain clock can be coarse); whereabouts must never be ambiguous.
CREATE TABLE IF NOT EXISTS records.file_movement (
  id          text PRIMARY KEY,
  seq         bigint GENERATED ALWAYS AS IDENTITY,
  file_id     text NOT NULL,
  kind        text NOT NULL,
  to_location text NOT NULL,
  to_staff_id text,
  note        text,
  at          timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS file_movement_file_idx ON records.file_movement (file_id, seq);
