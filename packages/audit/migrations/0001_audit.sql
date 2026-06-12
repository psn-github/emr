-- 0001_audit — the append-only, hash-chained audit + domain-event tables.
-- Forward-only (ADR-0008). No UPDATE/DELETE paths exist for these tables in the
-- application; the destructive-migration guard (scripts/check-migrations-safe.mjs)
-- blocks any later migration that would DROP/TRUNCATE/ALTER...DROP them.
-- IF NOT EXISTS keeps this safely re-runnable for dev/test bootstrap.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.audit_log (
  seq          bigint PRIMARY KEY,
  occurred_at  timestamptz NOT NULL,
  actor_id     text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  action       text NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  prev_hash    char(64) NOT NULL,
  hash         char(64) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_hash_uq ON audit.audit_log (hash);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit.audit_log (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit.domain_event (
  seq            bigint PRIMARY KEY,
  occurred_at    timestamptz NOT NULL,
  type           text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id   text NOT NULL,
  payload_json   jsonb,
  prev_hash      char(64) NOT NULL,
  hash           char(64) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS domain_event_hash_uq ON audit.domain_event (hash);
CREATE INDEX IF NOT EXISTS domain_event_aggregate_idx ON audit.domain_event (aggregate_type, aggregate_id);
