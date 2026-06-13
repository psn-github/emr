-- 0004_controlled_drugs — controlled-drugs register (docs/01 §E8 P0). A legal-
-- grade, witnessed (two-person), reconcilable ledger of every movement of a
-- controlled catalogue item, carrying the running book balance. Append-only:
-- no UPDATE/DELETE — corrections are a witnessed `adjustment` movement. The
-- Kuwaiti schedule classification and MOH report format are config (AMD-0005).
-- Forward-only, additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS inventory.cd_movement (
  id            text PRIMARY KEY,
  -- monotonic insertion order: a CD ledger's running balance must be reconstructed
  -- in the exact order entries were recorded (timestamps can tie or be backdated).
  seq           bigserial NOT NULL,
  item_id       text NOT NULL,
  lot_no        text NOT NULL,
  type          text NOT NULL,
  quantity      integer NOT NULL,
  balance_after integer NOT NULL,
  reason        text NOT NULL,
  patient_ref   text,
  actor_id      text NOT NULL,
  witnessed_by  text NOT NULL,
  occurred_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cd_movement_item_idx ON inventory.cd_movement (item_id);
