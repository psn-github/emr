import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { ConsumableUse, DrugAdministration, IntraOpRecord, SpecimenRecord } from "./types.js";
import type { IntraOpStore } from "./intraop-store.js";

/** Postgres-backed IntraOpStore (intra-op record, consumables, specimens). */
export class PgIntraOpStore implements IntraOpStore {
  constructor(private readonly pool: Pool) {}

  async saveRecord(r: IntraOpRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.intraop_record (id, encounter_id, procedure_performed, findings, anaesthetic_technique, drugs, staff, started_at, finished_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (encounter_id) DO UPDATE SET procedure_performed=EXCLUDED.procedure_performed, findings=EXCLUDED.findings, drugs=EXCLUDED.drugs`,
      [r.id, r.encounterId, r.procedurePerformed, r.findings, r.anaestheticTechnique, JSON.stringify(r.drugs), JSON.stringify(r.staff), r.startedAt, r.finishedAt, r.recordedBy],
    );
  }
  async recordForEncounter(encounterId: string): Promise<IntraOpRecord | undefined> {
    const r = await this.pool.query<RecRow>("SELECT * FROM perioperative.intraop_record WHERE encounter_id = $1", [encounterId]);
    return r.rows[0] ? recFrom(r.rows[0]) : undefined;
  }
  async saveConsumable(c: ConsumableUse): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.consumable_use (id, encounter_id, patient_id, code, description, lot_no, quantity, unit_price_fils, invoice_ref, recorded_by, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.encounterId, c.patientId, c.code, c.description, c.lotNo, c.quantity, c.unitPriceFils, c.invoiceRef, c.recordedBy, c.recordedAt],
    );
  }
  async consumablesForEncounter(encounterId: string): Promise<readonly ConsumableUse[]> {
    const r = await this.pool.query<ConsRow>("SELECT * FROM perioperative.consumable_use WHERE encounter_id = $1 ORDER BY recorded_at", [encounterId]);
    return r.rows.map(consFrom);
  }
  async saveSpecimen(s: SpecimenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.specimen_record (id, encounter_id, type, site, lot_ref, collected_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.encounterId, s.type, s.site, s.lotRef, s.collectedAt, s.recordedBy],
    );
  }
  async specimensForEncounter(encounterId: string): Promise<readonly SpecimenRecord[]> {
    const r = await this.pool.query<SpecRow>("SELECT * FROM perioperative.specimen_record WHERE encounter_id = $1 ORDER BY collected_at", [encounterId]);
    return r.rows.map(specFrom);
  }
}

interface RecRow { id: string; encounter_id: string; procedure_performed: string; findings: string; anaesthetic_technique: string; drugs: DrugAdministration[]; staff: string[]; started_at: Date; finished_at: Date; recorded_by: string }
interface ConsRow { id: string; encounter_id: string; patient_id: string; code: string; description: string; lot_no: string; quantity: number; unit_price_fils: number; invoice_ref: string; recorded_by: string; recorded_at: Date }
interface SpecRow { id: string; encounter_id: string; type: string; site: string; lot_ref: string; collected_at: Date; recorded_by: string }

const iso = (d: Date): string => new Date(d).toISOString();
function recFrom(r: RecRow): IntraOpRecord {
  return { id: asId<"IntraOpRecord">(r.id), encounterId: r.encounter_id, procedurePerformed: r.procedure_performed, findings: r.findings, anaestheticTechnique: r.anaesthetic_technique, drugs: r.drugs, staff: r.staff, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), recordedBy: r.recorded_by };
}
function consFrom(r: ConsRow): ConsumableUse {
  return { id: asId<"ConsumableUse">(r.id), encounterId: r.encounter_id, patientId: r.patient_id, code: r.code, description: r.description, lotNo: r.lot_no, quantity: r.quantity, unitPriceFils: r.unit_price_fils, invoiceRef: r.invoice_ref, recordedBy: r.recorded_by, recordedAt: iso(r.recorded_at) };
}
function specFrom(r: SpecRow): SpecimenRecord {
  return { id: asId<"SpecimenRecord">(r.id), encounterId: r.encounter_id, type: r.type, site: r.site, lotRef: r.lot_ref, collectedAt: iso(r.collected_at), recordedBy: r.recorded_by };
}
