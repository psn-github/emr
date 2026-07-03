import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type {
  Prescription,
  PrescriptionId,
  PrescriptionStatus,
  PrescriptionItem,
  AllergyWarning,
  Dispense,
  DispenseAllocation,
} from "./types.js";
import type { PharmacyStore } from "./store.js";

/** Postgres-backed PharmacyStore. Items/allocations/warnings are jsonb; the queue
 *  orders by the monotonic `seq` (oldest first). */
export class PgPharmacyStore implements PharmacyStore {
  constructor(private readonly pool: Pool) {}

  async savePrescription(p: Prescription): Promise<void> {
    await this.pool.query(
      `INSERT INTO pharmacy.prescription (id, patient_id, encounter_id, prescriber_id, status, items, allergy_warnings, cancel_reason, raised_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, items=EXCLUDED.items, allergy_warnings=EXCLUDED.allergy_warnings, cancel_reason=EXCLUDED.cancel_reason, updated_at=EXCLUDED.updated_at`,
      [p.id, p.patientId, p.encounterId, p.prescriberId, p.status, JSON.stringify(p.items), JSON.stringify(p.allergyWarnings), p.cancelReason, p.raisedAt, p.updatedAt],
    );
  }
  async getPrescription(id: PrescriptionId): Promise<Prescription | null> {
    const r = await this.pool.query<PrescriptionRow>("SELECT * FROM pharmacy.prescription WHERE id = $1", [id]);
    return r.rows[0] ? prescriptionFrom(r.rows[0]) : null;
  }
  async prescriptionsForEncounter(encounterId: string): Promise<readonly Prescription[]> {
    const r = await this.pool.query<PrescriptionRow>("SELECT * FROM pharmacy.prescription WHERE encounter_id = $1 ORDER BY seq", [encounterId]);
    return r.rows.map(prescriptionFrom);
  }
  async listPrescriptions(status?: PrescriptionStatus): Promise<readonly Prescription[]> {
    const r = status === undefined
      ? await this.pool.query<PrescriptionRow>("SELECT * FROM pharmacy.prescription ORDER BY seq")
      : await this.pool.query<PrescriptionRow>("SELECT * FROM pharmacy.prescription WHERE status = $1 ORDER BY seq", [status]);
    return r.rows.map(prescriptionFrom);
  }

  async saveDispense(d: Dispense): Promise<void> {
    await this.pool.query(
      `INSERT INTO pharmacy.dispense (id, prescription_id, dispensed_by, allocations, cold_chain_handled, witness_staff_id, dispensed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.prescriptionId, d.dispensedBy, JSON.stringify(d.allocations), d.coldChainHandled, d.witnessStaffId, d.dispensedAt],
    );
  }
  async dispensesForPrescription(prescriptionId: string): Promise<readonly Dispense[]> {
    const r = await this.pool.query<DispenseRow>("SELECT * FROM pharmacy.dispense WHERE prescription_id = $1 ORDER BY seq", [prescriptionId]);
    return r.rows.map(dispenseFrom);
  }
}

interface PrescriptionRow {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  prescriber_id: string;
  status: string;
  items: PrescriptionItem[];
  allergy_warnings: AllergyWarning[];
  cancel_reason: string | null;
  raised_at: Date;
  updated_at: Date;
}
interface DispenseRow {
  id: string;
  prescription_id: string;
  dispensed_by: string;
  allocations: DispenseAllocation[];
  cold_chain_handled: boolean;
  witness_staff_id: string | null;
  dispensed_at: Date;
}

const iso = (d: Date): string => new Date(d).toISOString();

function prescriptionFrom(r: PrescriptionRow): Prescription {
  return {
    id: asId<"Prescription">(r.id),
    patientId: r.patient_id,
    encounterId: r.encounter_id,
    prescriberId: r.prescriber_id,
    items: r.items,
    status: r.status as PrescriptionStatus,
    allergyWarnings: r.allergy_warnings,
    cancelReason: r.cancel_reason,
    raisedAt: iso(r.raised_at),
    updatedAt: iso(r.updated_at),
  };
}
function dispenseFrom(r: DispenseRow): Dispense {
  return {
    id: asId<"Dispense">(r.id),
    prescriptionId: r.prescription_id,
    dispensedBy: r.dispensed_by,
    allocations: r.allocations,
    coldChainHandled: r.cold_chain_handled,
    witnessStaffId: r.witness_staff_id,
    dispensedAt: iso(r.dispensed_at),
  };
}
