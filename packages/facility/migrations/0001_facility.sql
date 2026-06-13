-- 0001_facility — the building model (floors, locations, beds). Forward-only,
-- additive (ADR-0008). Config data with bilingual names. IF NOT EXISTS keeps it
-- safely re-runnable for dev/test bootstrap.

CREATE SCHEMA IF NOT EXISTS facility;

CREATE TABLE IF NOT EXISTS facility.floor (
  id      text PRIMARY KEY,
  level   text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL
);

CREATE TABLE IF NOT EXISTS facility.location_node (
  id       text PRIMARY KEY,
  level    text NOT NULL,
  type     text NOT NULL,
  name_ar  text NOT NULL,
  name_en  text NOT NULL,
  capacity integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS facility.bed (
  id               text PRIMARY KEY,
  location_node_id text NOT NULL,
  label            text NOT NULL,
  status           text NOT NULL DEFAULT 'free'
);
