import type { Charge, ChargeMasterItem } from "./types.js";

export interface ChargeMasterStore {
  saveItem(i: ChargeMasterItem): Promise<void>;
  getItem(code: string): Promise<ChargeMasterItem | null>;
  items(): Promise<readonly ChargeMasterItem[]>;
}

export interface ChargeStore {
  saveCharge(c: Charge): Promise<void>;
  /** Uninvoiced, billable charges for a patient (the next invoice's lines). */
  uninvoicedBillableForPatient(patientId: string): Promise<readonly Charge[]>;
  chargesForPatient(patientId: string): Promise<readonly Charge[]>;
  /** All invoiced charges — drives revenue-by-service-line. */
  invoicedCharges(): Promise<readonly Charge[]>;
  /** All uninvoiced, billable charges across patients — revenue-leakage candidates. */
  uninvoicedBillable(): Promise<readonly Charge[]>;
}

export class InMemoryChargeMasterStore implements ChargeMasterStore {
  private readonly map = new Map<string, ChargeMasterItem>();
  async saveItem(i: ChargeMasterItem): Promise<void> {
    this.map.set(i.code, i);
  }
  async getItem(code: string): Promise<ChargeMasterItem | null> {
    return this.map.get(code) ?? null;
  }
  async items(): Promise<readonly ChargeMasterItem[]> {
    return [...this.map.values()];
  }
}

export class InMemoryChargeStore implements ChargeStore {
  private readonly charges = new Map<string, Charge>();
  async saveCharge(c: Charge): Promise<void> {
    this.charges.set(c.id, c);
  }
  async uninvoicedBillableForPatient(patientId: string): Promise<readonly Charge[]> {
    return [...this.charges.values()].filter((c) => c.patientId === patientId && !c.recognised && c.invoiceId === null);
  }
  async chargesForPatient(patientId: string): Promise<readonly Charge[]> {
    return [...this.charges.values()].filter((c) => c.patientId === patientId);
  }
  async invoicedCharges(): Promise<readonly Charge[]> {
    return [...this.charges.values()].filter((c) => c.invoiceId !== null);
  }
  async uninvoicedBillable(): Promise<readonly Charge[]> {
    return [...this.charges.values()].filter((c) => !c.recognised && c.invoiceId === null);
  }
}
