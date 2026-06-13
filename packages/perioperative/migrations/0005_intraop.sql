-- 0005_intraop — intra-operative + anaesthesia record, consumables/implants at
-- point of use (lot-traced, billed), and specimen capture (docs/01 §E7).
-- Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS perioperative.intraop_record (
  id                    text PRIMARY KEY,
  encounter_id          text NOT NULL UNIQUE,
  procedure_performed   text NOT NULL,
  findings              text NOT NULL,
  anaesthetic_technique text NOT NULL,
  drugs                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  staff                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at            timestamptz NOT NULL,
  finished_at           timestamptz NOT NULL,
  recorded_by           text NOT NULL
);

CREATE TABLE IF NOT EXISTS perioperative.consumable_use (
  id              text PRIMARY KEY,
  encounter_id    text NOT NULL,
  code            text NOT NULL,
  description     text NOT NULL,
  lot_no          text NOT NULL,
  quantity        integer NOT NULL,
  unit_price_fils integer NOT NULL,
  invoice_ref     text NOT NULL,
  recorded_by     text NOT NULL,
  recorded_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS consumable_use_encounter_idx ON perioperative.consumable_use (encounter_id);

CREATE TABLE IF NOT EXISTS perioperative.specimen_record (
  id           text PRIMARY KEY,
  encounter_id text NOT NULL,
  type         text NOT NULL,
  site         text NOT NULL,
  lot_ref      text NOT NULL,
  collected_at timestamptz NOT NULL,
  recorded_by  text NOT NULL
);
CREATE INDEX IF NOT EXISTS specimen_record_encounter_idx ON perioperative.specimen_record (encounter_id);
