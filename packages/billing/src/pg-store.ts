import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Invoice, InvoiceId, InvoiceLine, Payment } from "./types.js";
import type { BillingStore } from "./store.js";

/** Postgres-backed BillingStore. Money is integer fils. */
export class PgBillingStore implements BillingStore {
  constructor(private readonly pool: Pool) {}

  async saveInvoice(i: Invoice): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.invoice (id, patient_id, currency, lines, tax_rate_bps, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, lines=EXCLUDED.lines`,
      [i.id, i.patientId, i.currency, JSON.stringify(i.lines), i.taxRateBps, i.status, i.createdAt],
    );
  }

  async getInvoice(id: InvoiceId): Promise<Invoice | null> {
    const r = await this.pool.query<InvoiceRow>("SELECT * FROM billing.invoice WHERE id = $1", [id]);
    return r.rows[0] ? invoiceFrom(r.rows[0]) : null;
  }

  async savePayment(p: Payment): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.payment (id, invoice_id, amount_fils, method, taken_by, receipt_no, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.invoiceId, p.amountFils, p.method, p.takenBy, p.receiptNo, p.at],
    );
  }

  async paymentsFor(invoiceId: InvoiceId): Promise<readonly Payment[]> {
    const r = await this.pool.query<PaymentRow>("SELECT * FROM billing.payment WHERE invoice_id = $1 ORDER BY at", [invoiceId]);
    return r.rows.map(paymentFrom);
  }
}

interface InvoiceRow {
  id: string;
  patient_id: string;
  currency: string;
  lines: InvoiceLine[];
  tax_rate_bps: number;
  status: string;
  created_at: Date;
}
interface PaymentRow {
  id: string;
  invoice_id: string;
  amount_fils: string | number;
  method: string;
  taken_by: string;
  receipt_no: string;
  at: Date;
}

function invoiceFrom(r: InvoiceRow): Invoice {
  return {
    id: asId<"Invoice">(r.id),
    patientId: r.patient_id,
    currency: "KWD",
    lines: r.lines,
    taxRateBps: r.tax_rate_bps,
    status: r.status as Invoice["status"],
    createdAt: new Date(r.created_at).toISOString(),
  };
}
function paymentFrom(r: PaymentRow): Payment {
  return {
    id: asId<"Payment">(r.id),
    invoiceId: asId<"Invoice">(r.invoice_id),
    amountFils: Number(r.amount_fils),
    method: r.method as Payment["method"],
    takenBy: r.taken_by,
    receiptNo: r.receipt_no,
    at: new Date(r.at).toISOString(),
  };
}
