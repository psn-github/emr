-- Demand planning from the cycle pipeline (docs/01 §E9 P2). Additive only
-- (forward-only, docs/PATIENT-DATA.md): a config table holding the per-cycle-type
-- consumption profile (bill-of-materials) used to forecast media/consumable burn.

CREATE TABLE IF NOT EXISTS inventory.cycle_consumption_profile (
  cycle_type text PRIMARY KEY,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb
);
