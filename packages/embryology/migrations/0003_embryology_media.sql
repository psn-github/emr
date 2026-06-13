-- 0003_embryology_media — media-lot ↔ embryo traceability (docs/01 §E4). Records
-- which culture-media/consumable lot touched which embryo/oocyte, keyed by the
-- inventory's own (item_id, lot_no) so a manufacturer recall maps straight to the
-- embryos exposed. Append-only clinical fact. Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS embryology.media_application (
  id         text PRIMARY KEY,
  cycle_id   text NOT NULL,
  embryo_id  text,
  oocyte_id  text,
  item_id    text NOT NULL,
  lot_no     text NOT NULL,
  step       text NOT NULL,
  quantity   integer NOT NULL,
  applied_at timestamptz NOT NULL,
  operator   text NOT NULL
);
CREATE INDEX IF NOT EXISTS media_application_lot_idx ON embryology.media_application (item_id, lot_no);
CREATE INDEX IF NOT EXISTS media_application_cycle_idx ON embryology.media_application (cycle_id);
