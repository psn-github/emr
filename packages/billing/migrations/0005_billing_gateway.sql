-- 0005_billing_gateway — payment gateway reference (docs/01 §E11, ADR-0036). A
-- payment/refund taken through the KNET/card gateway carries the processor's
-- transaction reference for reconciliation/receipts. Forward-only, additive
-- (ADR-0008); IF NOT EXISTS keeps it re-runnable.

ALTER TABLE billing.payment ADD COLUMN IF NOT EXISTS gateway_ref text NOT NULL DEFAULT '';
