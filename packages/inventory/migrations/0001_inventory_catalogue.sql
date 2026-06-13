-- 0001_inventory_catalogue — suppliers + item catalogue (docs/01 §E9). Forward-only,
-- additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE IF NOT EXISTS inventory.supplier (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  contact_email text,
  contact_phone text,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS inventory.catalogue_item (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  category              text NOT NULL,
  unit                  text NOT NULL,
  pack_size             integer NOT NULL,
  cold_chain            boolean NOT NULL DEFAULT false,
  controlled            boolean NOT NULL DEFAULT false,
  par_level             integer NOT NULL DEFAULT 0,
  preferred_supplier_id text
);
