import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { AntenatalVisit, Pregnancy, PregnancyId, PregnancyStatus } from "./types.js";
import type { AntenatalStore } from "./antenatal-store.js";

/** Postgres-backed AntenatalStore. Clinical data is append-only / soft-update. */
export class PgAntenatalStore implements AntenatalStore {
  constructor(private readonly pool: Pool) {}

  async savePregnancy(p: Pregnancy): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.pregnancy (id, patient_id, lmp, edd, gravida, para, risk_factors, status, booked_by, booked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, risk_factors=EXCLUDED.risk_factors`,
      [p.id, p.patientId, p.lmp, p.edd, p.gravida, p.para, JSON.stringify(p.riskFactors), p.status, p.bookedBy, p.bookedAt],
    );
  }
  async getPregnancy(id: PregnancyId): Promise<Pregnancy | null> {
    const r = await this.pool.query<PregnancyRow>("SELECT * FROM clinical.pregnancy WHERE id = $1", [id]);
    return r.rows[0] ? pregnancyFrom(r.rows[0]) : null;
  }
  async activePregnancyForPatient(patientId: string): Promise<Pregnancy | null> {
    const r = await this.pool.query<PregnancyRow>("SELECT * FROM clinical.pregnancy WHERE patient_id = $1 AND status = 'active' ORDER BY booked_at DESC LIMIT 1", [patientId]);
    return r.rows[0] ? pregnancyFrom(r.rows[0]) : null;
  }
  async saveVisit(v: AntenatalVisit): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.antenatal_visit (id, pregnancy_id, patient_id, visit_at, gestation_weeks, bp_systolic, bp_diastolic, fundal_height_cm, proteinuria, presentation, fetal_heart_rate, risk_flags, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [v.id, v.pregnancyId, v.patientId, v.visitAt, v.gestationWeeks, v.bpSystolic, v.bpDiastolic, v.fundalHeightCm, v.proteinuria, v.presentation, v.fetalHeartRate, JSON.stringify(v.riskFlags), v.note, v.recordedBy],
    );
  }
  async visitsForPregnancy(pregnancyId: PregnancyId): Promise<readonly AntenatalVisit[]> {
    const r = await this.pool.query<VisitRow>("SELECT * FROM clinical.antenatal_visit WHERE pregnancy_id = $1 ORDER BY visit_at", [pregnancyId]);
    return r.rows.map(visitFrom);
  }
}

interface PregnancyRow { id: string; patient_id: string; lmp: string; edd: string; gravida: number; para: number; risk_factors: string[]; status: string; booked_by: string; booked_at: Date }
interface VisitRow { id: string; pregnancy_id: string; patient_id: string; visit_at: Date; gestation_weeks: number; bp_systolic: number; bp_diastolic: number; fundal_height_cm: string | null; proteinuria: boolean; presentation: string | null; fetal_heart_rate: number | null; risk_flags: string[]; note: string | null; recorded_by: string }

const isoDate = (d: string | Date): string => (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

function pregnancyFrom(r: PregnancyRow): Pregnancy {
  return { id: asId<"Pregnancy">(r.id), patientId: r.patient_id, lmp: isoDate(r.lmp), edd: isoDate(r.edd), gravida: r.gravida, para: r.para, riskFactors: r.risk_factors, status: r.status as PregnancyStatus, bookedBy: r.booked_by, bookedAt: new Date(r.booked_at).toISOString() };
}
function visitFrom(r: VisitRow): AntenatalVisit {
  return {
    id: asId<"AntenatalVisit">(r.id),
    pregnancyId: asId<"Pregnancy">(r.pregnancy_id),
    patientId: r.patient_id,
    visitAt: new Date(r.visit_at).toISOString(),
    gestationWeeks: r.gestation_weeks,
    bpSystolic: r.bp_systolic,
    bpDiastolic: r.bp_diastolic,
    fundalHeightCm: r.fundal_height_cm === null ? null : Number(r.fundal_height_cm),
    proteinuria: r.proteinuria,
    presentation: r.presentation,
    fetalHeartRate: r.fetal_heart_rate,
    riskFlags: r.risk_flags,
    note: r.note,
    recordedBy: r.recorded_by,
  };
}
