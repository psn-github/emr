-- Lab QC log (docs/01 §E5 P1): incubator gas/temp + media pH/osmolality readings
-- evaluated against configured acceptable ranges. Additive only (forward-only,
-- docs/PATIENT-DATA.md): two new tables, no changes to existing ones.

CREATE TABLE IF NOT EXISTS embryology.qc_parameter (
  code      text PRIMARY KEY,
  name_ar   text NOT NULL,
  name_en   text NOT NULL,
  unit      text NOT NULL,
  min_value numeric NOT NULL,
  max_value numeric NOT NULL,
  active    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS embryology.qc_reading (
  id             text PRIMARY KEY,
  parameter_code text NOT NULL,
  value          numeric NOT NULL,
  unit           text NOT NULL,
  asset_ref      text,
  lot_no         text,
  status         text NOT NULL,
  recorded_by    text NOT NULL,
  recorded_at    timestamptz NOT NULL,
  note           text
);

CREATE INDEX IF NOT EXISTS qc_reading_param_idx ON embryology.qc_reading (parameter_code);
CREATE INDEX IF NOT EXISTS qc_reading_asset_idx ON embryology.qc_reading (asset_ref);
CREATE INDEX IF NOT EXISTS qc_reading_lot_idx ON embryology.qc_reading (lot_no);
