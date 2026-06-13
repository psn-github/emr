import type { Invoice, InvoiceId, Payment } from "./types.js";

export interface BillingStore {
  saveInvoice(i: Invoice): Promise<void>;
  getInvoice(id: InvoiceId): Promise<Invoice | null>;
  savePayment(p: Payment): Promise<void>;
  paymentsFor(invoiceId: InvoiceId): Promise<readonly Payment[]>;
  /** All open (unpaid) invoices — drives the receivables-ageing dashboard. */
  openInvoices(): Promise<readonly Invoice[]>;
  /** All invoices for a patient — drives the portal balances view. */
  invoicesForPatient(patientId: string): Promise<readonly Invoice[]>;
}

export class InMemoryBillingStore implements BillingStore {
  private readonly invoices = new Map<string, Invoice>();
  private readonly payments: Payment[] = [];

  async saveInvoice(i: Invoice): Promise<void> {
    this.invoices.set(i.id, i);
  }
  async getInvoice(id: InvoiceId): Promise<Invoice | null> {
    return this.invoices.get(id) ?? null;
  }
  async savePayment(p: Payment): Promise<void> {
    this.payments.push(p);
  }
  async paymentsFor(invoiceId: InvoiceId): Promise<readonly Payment[]> {
    return this.payments.filter((p) => p.invoiceId === invoiceId);
  }
  async openInvoices(): Promise<readonly Invoice[]> {
    return [...this.invoices.values()].filter((i) => i.status === "open");
  }
  async invoicesForPatient(patientId: string): Promise<readonly Invoice[]> {
    return [...this.invoices.values()].filter((i) => i.patientId === patientId);
  }
}
