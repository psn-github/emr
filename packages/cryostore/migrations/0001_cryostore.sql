-- 0001_cryostore — tank topology, specimens (person|couple owned), witnessed
-- chain-of-custody, storage consent/expiry, tank monitoring, and the AMD-0003
-- non-engagement pathway (docs/01 §E6). Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable. Witnessing lives in the witnessing schema.

CREATE SCHEMA IF NOT EXISTS cryostore;

CREATE TABLE IF NOT EXISTS cryostore.tank (
  id    text PRIMARY KEY,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS cryostore.cryo_specimen (
  id               text PRIMARY KEY,
  kind             text NOT NULL,
  owner            jsonb NOT NULL,
  cycle_id         text NOT NULL,
  straws           integer NOT NULL,
  position         jsonb NOT NULL,
  position_key     text NOT NULL,
  status           text NOT NULL,
  freeze_event_ref text NOT NULL,
  witness_key      text NOT NULL,
  created_at       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cryo_specimen_owner_idx ON cryostore.cryo_specimen (cycle_id);
CREATE INDEX IF NOT EXISTS cryo_specimen_position_idx ON cryostore.cryo_specimen (position_key);

CREATE TABLE IF NOT EXISTS cryostore.custody_event (
  id            text PRIMARY KEY,
  specimen_id   text NOT NULL,
  type          text NOT NULL,
  from_position jsonb,
  to_position   jsonb,
  occurred_at   timestamptz NOT NULL,
  operator      text NOT NULL,
  witness_key   text NOT NULL
);
CREATE INDEX IF NOT EXISTS custody_event_specimen_idx ON cryostore.custody_event (specimen_id);

CREATE TABLE IF NOT EXISTS cryostore.storage_consent (
  id           text PRIMARY KEY,
  specimen_id  text NOT NULL UNIQUE,
  consented_at timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  renewed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS cryostore.tank_reading (
  id                 text PRIMARY KEY,
  tank_id            text NOT NULL,
  temperature_c      double precision NOT NULL,
  nitrogen_level_pct double precision NOT NULL,
  recorded_at        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tank_reading_tank_idx ON cryostore.tank_reading (tank_id);

CREATE TABLE IF NOT EXISTS cryostore.engagement (
  specimen_id text PRIMARY KEY,
  state       text NOT NULL
);
