-- 0001_witnessing — handling-event observations + the append-only
-- reconciliation ledger against RI Witness (ADR-0018). Forward-only, additive
-- (ADR-0008). IF NOT EXISTS keeps it re-runnable. Oxford stores no witnessing
-- decision of its own — RI Witness is authoritative.

CREATE SCHEMA IF NOT EXISTS witnessing;

CREATE TABLE IF NOT EXISTS witnessing.handling_event (
  id          text PRIMARY KEY,
  cycle_id    text NOT NULL,
  step_key    text NOT NULL,
  oxford_key  text NOT NULL,
  patient_id  text NOT NULL,
  sample_id   text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS handling_event_cycle_idx ON witnessing.handling_event (cycle_id);

CREATE TABLE IF NOT EXISTS witnessing.reconciliation (
  id                text PRIMARY KEY,
  cycle_id          text NOT NULL,
  handling_event_id text,
  oxford_key        text NOT NULL,
  ri_record_id      text,
  status            text NOT NULL,
  reason            text,
  reconciled_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS reconciliation_cycle_idx ON witnessing.reconciliation (cycle_id);
