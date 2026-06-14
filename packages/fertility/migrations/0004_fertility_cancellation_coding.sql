-- Coded cancellation reasons + cycle conversion (docs/01 §E3 P1). Additive only:
-- new config table + new nullable columns; the legacy free-text cancellation_reason
-- column is left in place (forward-only, no drops — docs/PATIENT-DATA.md).

CREATE TABLE IF NOT EXISTS fertility.cancellation_reason (
  code      text PRIMARY KEY,
  category  text NOT NULL,
  name_ar   text NOT NULL,
  name_en   text NOT NULL,
  active    boolean NOT NULL DEFAULT true
);

ALTER TABLE fertility.cycle ADD COLUMN IF NOT EXISTS cancellation_reason_code text;
ALTER TABLE fertility.cycle ADD COLUMN IF NOT EXISTS cancellation_category    text;
ALTER TABLE fertility.cycle ADD COLUMN IF NOT EXISTS cancellation_note        text;
ALTER TABLE fertility.cycle ADD COLUMN IF NOT EXISTS converted_from_id        text;

CREATE INDEX IF NOT EXISTS cycle_converted_from_idx ON fertility.cycle (converted_from_id);
