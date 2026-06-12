-- 0001_registry — patient & couple registry. Forward-only (ADR-0008).
-- The Civil ID column holds ONLY the encrypted envelope (field-level encryption,
-- docs/02 §5). Cross-module references are logical ids, not DB foreign keys
-- (hard module boundaries). Clinical data is soft-deleted only — no row removal.
-- IF NOT EXISTS keeps this safely re-runnable for dev/test bootstrap.

CREATE SCHEMA IF NOT EXISTS registry;

CREATE TABLE IF NOT EXISTS registry.person (
  id            text PRIMARY KEY,
  name_ar       text NOT NULL,
  name_en       text NOT NULL,
  civil_id_enc  text NOT NULL,   -- encrypted envelope (iv.tag.ciphertext); never plaintext
  dob           date NOT NULL,
  sex           text NOT NULL,
  nationality   text NOT NULL,
  language_pref text NOT NULL DEFAULT 'ar',
  phone         text,
  email         text,
  photo_ref     text,
  deleted_at    timestamptz,
  merged_into   text
);

CREATE TABLE IF NOT EXISTS registry.couple (
  id                       text PRIMARY KEY,
  husband_person_id        text NOT NULL,
  wife_person_id           text NOT NULL,
  marriage_verification_id text,
  status                   text NOT NULL DEFAULT 'pending_verification'
);

CREATE TABLE IF NOT EXISTS registry.marriage_verification (
  id           text PRIMARY KEY,
  couple_id    text NOT NULL,
  document_ref text NOT NULL,
  verified_by  text NOT NULL,
  verified_at  timestamptz NOT NULL,
  method       text NOT NULL
);
