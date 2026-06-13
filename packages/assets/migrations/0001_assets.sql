-- 0001_assets — asset & biomedical-equipment management (docs/01 §E10). Asset
-- register (with a `critical` flag driving the use-blocking calibration gate,
-- ADR-0029), PPM/calibration records with next-due dates, and a fault/downtime
-- log. Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS assets;

CREATE TABLE IF NOT EXISTS assets.asset (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  category        text NOT NULL,
  location_id     text NOT NULL,
  serial_number   text NOT NULL,
  supplier_id     text,
  warranty_expiry text,
  critical        boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS asset_location_idx ON assets.asset (location_id);

CREATE TABLE IF NOT EXISTS assets.maintenance_record (
  id            text PRIMARY KEY,
  asset_id      text NOT NULL,
  type          text NOT NULL,
  performed_at  timestamptz NOT NULL,
  performed_by  text NOT NULL,
  next_due_date timestamptz,
  notes         text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS maintenance_asset_idx ON assets.maintenance_record (asset_id);

CREATE TABLE IF NOT EXISTS assets.fault_record (
  id               text PRIMARY KEY,
  asset_id         text NOT NULL,
  reported_at      timestamptz NOT NULL,
  reported_by      text NOT NULL,
  description      text NOT NULL,
  severity         text NOT NULL,
  resolved_at      timestamptz,
  downtime_minutes integer
);
CREATE INDEX IF NOT EXISTS fault_asset_idx ON assets.fault_record (asset_id);
