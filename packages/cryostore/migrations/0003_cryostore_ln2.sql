-- LN₂ consumption + tank PPM linkage (docs/01 §E6 P2). Additive only (forward-only,
-- docs/PATIENT-DATA.md): link tanks to their Asset record for PPM, and log LN₂
-- top-ups so consumption can be read back over a window.

ALTER TABLE cryostore.tank ADD COLUMN IF NOT EXISTS asset_ref text;

CREATE TABLE IF NOT EXISTS cryostore.ln_fill (
  id           text PRIMARY KEY,
  tank_id      text NOT NULL,
  litres_added double precision NOT NULL,
  filled_at    timestamptz NOT NULL,
  filled_by    text NOT NULL
);
CREATE INDEX IF NOT EXISTS ln_fill_tank_idx ON cryostore.ln_fill (tank_id);
