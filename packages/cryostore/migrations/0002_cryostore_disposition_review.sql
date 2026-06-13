-- 0002_cryostore_disposition_review — marital-status-change disposition review
-- (AMD-0004 / ADR-0015). A marital-status change opens a review of the couple's
-- stored specimens; resolution is a reviewed human decision (retain/discard)
-- with a recorded rationale — NEVER automatic, never auto-destroy. Forward-only,
-- additive (ADR-0008); IF NOT EXISTS keeps it re-runnable.

CREATE TABLE IF NOT EXISTS cryostore.disposition_review (
  id          text PRIMARY KEY,
  specimen_id text NOT NULL,
  reason      text NOT NULL,
  state       text NOT NULL,
  outcome     text,
  rationale   text,
  opened_by   text NOT NULL,
  opened_at   timestamptz NOT NULL,
  resolved_by text,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS disposition_review_specimen_idx ON cryostore.disposition_review (specimen_id);
