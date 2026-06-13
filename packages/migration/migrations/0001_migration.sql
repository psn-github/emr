-- 0001_migration — import ledger for the Cliniko cutover (ADR-0017, Option B).
-- Forward-only, additive (ADR-0008). Makes the migration idempotent/re-runnable.

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.import_ledger (
  source_system text NOT NULL,
  entity        text NOT NULL,
  source_id     text NOT NULL,
  target_id     text NOT NULL,
  imported_at   timestamptz NOT NULL,
  PRIMARY KEY (source_system, entity, source_id)
);
