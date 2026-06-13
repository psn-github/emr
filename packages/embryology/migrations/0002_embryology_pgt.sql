-- 0002_embryology_pgt — PGT order/consent/result capture (docs/01 §E4 P1). The
-- genetics lab stays external; this captures the order (with consent + permitted
-- indication) and the returned result. Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS embryology.pgt_order (
  id                   text PRIMARY KEY,
  embryo_id            text NOT NULL,
  cycle_id             text NOT NULL,
  type                 text NOT NULL,
  indication           text NOT NULL,
  consent_document_ref text NOT NULL,
  ordered_by           text NOT NULL,
  ordered_at           timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS pgt_order_cycle_idx ON embryology.pgt_order (cycle_id);

CREATE TABLE IF NOT EXISTS embryology.pgt_result (
  id          text PRIMARY KEY,
  order_id    text NOT NULL,
  embryo_id   text NOT NULL,
  status      text NOT NULL,
  report_ref  text NOT NULL,
  resolved_at timestamptz NOT NULL,
  recorded_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS pgt_result_order_idx ON embryology.pgt_result (order_id);
