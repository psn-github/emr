-- 0002_billing_refunds — refunds + no-cash/no-tax (ADR-0034/0035). A payment row
-- gains `kind` (payment|refund) and a `reason`; refunds are append-only ledger
-- entries (never deletes). The legacy `tax_rate_bps` column is RETAINED (additive-
-- only migrations) but unused — there is no tax in Kuwait. Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable.

ALTER TABLE billing.payment ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';
ALTER TABLE billing.payment ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '';
