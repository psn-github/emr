import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Charge, ChargeMasterItem, BilingualText } from "./types.js";
import type { ChargeMasterStore, ChargeStore } from "./charge-store.js";

/** Postgres-backed charge master (priceable charge codes; no free-text). */
export class PgChargeMasterStore implements ChargeMasterStore {
  constructor(private readonly pool: Pool) {}
  async saveItem(i: ChargeMasterItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.charge_master (code, description, unit_amount_fils, active)
       VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description, unit_amount_fils=EXCLUDED.unit_amount_fils, active=EXCLUDED.active`,
      [i.code, JSON.stringify(i.description), i.unitAmountFils, i.active],
    );
  }
  async getItem(code: string): Promise<ChargeMasterItem | null> {
    const r = await this.pool.query<MasterRow>("SELECT * FROM billing.charge_master WHERE code = $1", [code]);
    return r.rows[0] ? masterFrom(r.rows[0]) : null;
  }
  async items(): Promise<readonly ChargeMasterItem[]> {
    const r = await this.pool.query<MasterRow>("SELECT * FROM billing.charge_master ORDER BY code");
    return r.rows.map(masterFrom);
  }
}

/** Postgres-backed captured-charge store. */
export class PgChargeStore implements ChargeStore {
  constructor(private readonly pool: Pool) {}
  async saveCharge(c: Charge): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.charge (id, patient_id, charge_code, description, quantity, unit_amount_fils, source, occurred_at, recognised, patient_package_id, invoice_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET invoice_id=EXCLUDED.invoice_id`,
      [c.id, c.patientId, c.chargeCode, JSON.stringify(c.description), c.quantity, c.unitAmountFils, c.source, c.occurredAt, c.recognised, c.patientPackageId, c.invoiceId],
    );
  }
  async uninvoicedBillableForPatient(patientId: string): Promise<readonly Charge[]> {
    const r = await this.pool.query<ChargeRow>("SELECT * FROM billing.charge WHERE patient_id = $1 AND recognised = false AND invoice_id IS NULL ORDER BY occurred_at", [patientId]);
    return r.rows.map(chargeFrom);
  }
  async chargesForPatient(patientId: string): Promise<readonly Charge[]> {
    const r = await this.pool.query<ChargeRow>("SELECT * FROM billing.charge WHERE patient_id = $1 ORDER BY occurred_at", [patientId]);
    return r.rows.map(chargeFrom);
  }
  async invoicedCharges(): Promise<readonly Charge[]> {
    const r = await this.pool.query<ChargeRow>("SELECT * FROM billing.charge WHERE invoice_id IS NOT NULL ORDER BY occurred_at", []);
    return r.rows.map(chargeFrom);
  }
  async uninvoicedBillable(): Promise<readonly Charge[]> {
    const r = await this.pool.query<ChargeRow>("SELECT * FROM billing.charge WHERE recognised = false AND invoice_id IS NULL ORDER BY occurred_at", []);
    return r.rows.map(chargeFrom);
  }
}

interface MasterRow { code: string; description: BilingualText; unit_amount_fils: string | number; active: boolean }
interface ChargeRow { id: string; patient_id: string; charge_code: string; description: BilingualText; quantity: string | number; unit_amount_fils: string | number; source: string; occurred_at: Date; recognised: boolean; patient_package_id: string | null; invoice_id: string | null }

function masterFrom(r: MasterRow): ChargeMasterItem {
  return { code: r.code, description: r.description, unitAmountFils: Number(r.unit_amount_fils), active: r.active };
}
function chargeFrom(r: ChargeRow): Charge {
  return { id: asId<"Charge">(r.id), patientId: r.patient_id, chargeCode: r.charge_code, description: r.description, quantity: Number(r.quantity), unitAmountFils: Number(r.unit_amount_fils), source: r.source as Charge["source"], occurredAt: new Date(r.occurred_at).toISOString(), recognised: r.recognised, patientPackageId: r.patient_package_id, invoiceId: r.invoice_id };
}
