-- Clinical pathways / order sets (docs/01 §E13 P1): named bundles of orders that
-- can be applied to an encounter in one step. Additive only (forward-only,
-- docs/PATIENT-DATA.md): one new config table, no changes to existing ones.

CREATE TABLE IF NOT EXISTS clinical.order_set (
  id      text PRIMARY KEY,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  items   jsonb NOT NULL DEFAULT '[]'::jsonb,
  active  boolean NOT NULL DEFAULT true
);
