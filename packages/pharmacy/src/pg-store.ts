import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type {
  Prescription,
  PrescriptionId,
  PrescriptionStatus,
  PrescriptionItem,
  AllergyWarning,
  TheatreDrugAdministration,
  TheatreDrugItem,
  StockAllocation,
} from "./types.js";
import type { PharmacyStore } from "./store.js";

/** Postgres-backed PharmacyStore. Items/allocations/warnings are jsonb; the queue
 *  orders by the monotonic `seq` (oldest first). */
export class PgPharmacyStore implements PharmacyStore {
  constructor(private readonly pool: Pool) {}

  async savePrescription(p: Prescription): Promise<void> {
    await this.pool.query(
      `INSERT INTO pharmacy.prescription (id, patient_id, encounter_id, prescriber_id, status, items, allergy_warnings, external_ref, fulfilment_note, cancel_reason, raised_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, items=EXCLUDED.items, allergy_warnings=EXCLUDED.allergy_warnings, external_ref=EXCLUDED.external_ref, fulfilment_note=EXCLUDED.fulfilment_note, cancel_reason=EXCLUDED.cancel_reason, updated_at=EXCLUDED.updated_at`,
      [p.id, p.patientId, p.encounterId, p.prescriberId, p.status, JSON.stringify(p.items), JSON.stringify(p.allergyWarnings), p.externalRef, p.fulfilmentNote, p.cancelReason, p.raisedAt, p.updatedAt],
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

  async saveTheatreAdministration(a: TheatreDrugAdministration): Promise<void> {
    await this.pool.query(
      `INSERT INTO pharmacy.theatre_drug_administration (id, encounter_id, patient_id, administered_by, items, allocations, cold_chain_handled, witness_staff_id, location_id, administered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.encounterId, a.patientId, a.administeredBy, JSON.stringify(a.items), JSON.stringify(a.allocations), a.coldChainHandled, a.witnessStaffId, a.locationId, a.administeredAt],
    );
  }
  async theatreAdministrationsForEncounter(encounterId: string): Promise<readonly TheatreDrugAdministration[]> {
    const r = await this.pool.query<TheatreAdminRow>("SELECT * FROM pharmacy.theatre_drug_administration WHERE encounter_id = $1 ORDER BY seq", [encounterId]);
    return r.rows.map(theatreAdminFrom);
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
  external_ref: string | null;
  fulfilment_note: string | null;
  cancel_reason: string | null;
  raised_at: Date;
  updated_at: Date;
}
interface TheatreAdminRow {
  id: string;
  encounter_id: string;
  patient_id: string;
  administered_by: string;
  items: TheatreDrugItem[];
  allocations: StockAllocation[];
  cold_chain_handled: boolean;
  witness_staff_id: string | null;
  location_id: string;
  administered_at: Date;
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
    externalRef: r.external_ref,
    fulfilmentNote: r.fulfilment_note,
    cancelReason: r.cancel_reason,
    raisedAt: iso(r.raised_at),
    updatedAt: iso(r.updated_at),
  };
}
function theatreAdminFrom(r: TheatreAdminRow): TheatreDrugAdministration {
  return {
    id: asId<"TheatreDrugAdministration">(r.id),
    encounterId: r.encounter_id,
    patientId: r.patient_id,
    administeredBy: r.administered_by,
    items: r.items,
    allocations: r.allocations,
    coldChainHandled: r.cold_chain_handled,
    witnessStaffId: r.witness_staff_id,
    locationId: r.location_id,
    administeredAt: iso(r.administered_at),
  };
}
