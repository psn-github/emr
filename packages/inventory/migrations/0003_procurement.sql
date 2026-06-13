-- 0003_procurement — requisition → PO → goods receipt → supplier invoice (for the
-- 3-way match; docs/01 §E9). AP money is integer fils (ADR-0027). Forward-only,
-- additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS inventory.requisition (
  id           text PRIMARY KEY,
  lines        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL,
  reason       text NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory.purchase_order (
  id             text PRIMARY KEY,
  requisition_id text,
  supplier_id    text NOT NULL,
  lines          jsonb NOT NULL DEFAULT '[]'::jsonb,
  status         text NOT NULL,
  created_at     timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory.goods_receipt (
  id          text PRIMARY KEY,
  po_id       text NOT NULL,
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL,
  received_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS goods_receipt_po_idx ON inventory.goods_receipt (po_id);

CREATE TABLE IF NOT EXISTS inventory.supplier_invoice (
  id          text PRIMARY KEY,
  po_id       text NOT NULL,
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_fils  integer NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS supplier_invoice_po_idx ON inventory.supplier_invoice (po_id);
