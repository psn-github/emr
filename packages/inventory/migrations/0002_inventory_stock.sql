-- 0002_inventory_stock — multi-location stock lots (lot/expiry) + cold-chain log
-- (docs/01 §E9). Forward-only, additive (ADR-0008); IF NOT EXISTS re-runnable.

CREATE TABLE IF NOT EXISTS inventory.stock_lot (
  id          text PRIMARY KEY,
  item_id     text NOT NULL,
  lot_no      text NOT NULL,
  location_id text NOT NULL,
  quantity    integer NOT NULL,
  expiry_date date NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_lot_item_idx ON inventory.stock_lot (item_id);

CREATE TABLE IF NOT EXISTS inventory.cold_chain_reading (
  id            text PRIMARY KEY,
  location_id   text NOT NULL,
  temperature_c double precision NOT NULL,
  recorded_at   timestamptz NOT NULL,
  recorded_by   text NOT NULL
);
CREATE INDEX IF NOT EXISTS cold_chain_location_idx ON inventory.cold_chain_reading (location_id);
