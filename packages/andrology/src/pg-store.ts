import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { SemenAnalysis, SpermPrep, SpermFreeze, SurgicalRetrieval, SemenParameters, SemenFlags } from "./types.js";
import type { AndrologyStore } from "./store.js";

/** Postgres-backed AndrologyStore. Clinical lab data is append-only; inserts only. */
export class PgAndrologyStore implements AndrologyStore {
  constructor(private readonly pool: Pool) {}

  async saveAnalysis(a: SemenAnalysis): Promise<void> {
    await this.pool.query(
      `INSERT INTO andrology.semen_analysis (id, patient_id, collected_at, parameters, flags, all_within_reference, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.patientId, a.collectedAt, JSON.stringify(a.parameters), JSON.stringify(a.flags), a.allWithinReference, a.recordedBy],
    );
  }
  async analysesForPatient(patientId: string): Promise<readonly SemenAnalysis[]> {
    const r = await this.pool.query<AnalysisRow>("SELECT * FROM andrology.semen_analysis WHERE patient_id = $1 ORDER BY collected_at", [patientId]);
    return r.rows.map(analysisFrom);
  }
  async savePrep(p: SpermPrep): Promise<void> {
    await this.pool.query(
      `INSERT INTO andrology.sperm_prep (id, patient_id, method, post_prep_concentration, post_prep_progressive_motility, prepared_by, prepared_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.patientId, p.method, p.postPrepConcentrationMillionPerMl, p.postPrepProgressiveMotilityPct, p.preparedBy, p.preparedAt],
    );
  }
  async prepsForPatient(patientId: string): Promise<readonly SpermPrep[]> {
    const r = await this.pool.query<PrepRow>("SELECT * FROM andrology.sperm_prep WHERE patient_id = $1 ORDER BY prepared_at", [patientId]);
    return r.rows.map(prepFrom);
  }
  async saveFreeze(f: SpermFreeze): Promise<void> {
    await this.pool.query(
      `INSERT INTO andrology.sperm_freeze (id, patient_id, cryo_specimen_ref, straws, frozen_by, frozen_at, witness_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.patientId, f.cryoSpecimenRef, f.straws, f.frozenBy, f.frozenAt, f.witnessKey],
    );
  }
  async freezesForPatient(patientId: string): Promise<readonly SpermFreeze[]> {
    const r = await this.pool.query<FreezeRow>("SELECT * FROM andrology.sperm_freeze WHERE patient_id = $1 ORDER BY frozen_at", [patientId]);
    return r.rows.map(freezeFrom);
  }
  async saveRetrieval(rec: SurgicalRetrieval): Promise<void> {
    await this.pool.query(
      `INSERT INTO andrology.surgical_retrieval (id, patient_id, method, theatre_booking_ref, sperm_found, performed_by, performed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [rec.id, rec.patientId, rec.method, rec.theatreBookingRef, rec.spermFound, rec.performedBy, rec.performedAt],
    );
  }
  async retrievalsForPatient(patientId: string): Promise<readonly SurgicalRetrieval[]> {
    const r = await this.pool.query<RetrievalRow>("SELECT * FROM andrology.surgical_retrieval WHERE patient_id = $1 ORDER BY performed_at", [patientId]);
    return r.rows.map(retrievalFrom);
  }
}

interface AnalysisRow { id: string; patient_id: string; collected_at: Date; parameters: SemenParameters; flags: SemenFlags; all_within_reference: boolean; recorded_by: string }
interface PrepRow { id: string; patient_id: string; method: string; post_prep_concentration: number; post_prep_progressive_motility: number; prepared_by: string; prepared_at: Date }
interface FreezeRow { id: string; patient_id: string; cryo_specimen_ref: string; straws: number; frozen_by: string; frozen_at: Date; witness_key: string }
interface RetrievalRow { id: string; patient_id: string; method: string; theatre_booking_ref: string; sperm_found: boolean; performed_by: string; performed_at: Date }

const iso = (d: Date): string => new Date(d).toISOString();

function analysisFrom(r: AnalysisRow): SemenAnalysis {
  return { id: asId<"SemenAnalysis">(r.id), patientId: r.patient_id, collectedAt: iso(r.collected_at), parameters: r.parameters, flags: r.flags, allWithinReference: r.all_within_reference, recordedBy: r.recorded_by };
}
function prepFrom(r: PrepRow): SpermPrep {
  return { id: asId<"SpermPrep">(r.id), patientId: r.patient_id, method: r.method as SpermPrep["method"], postPrepConcentrationMillionPerMl: r.post_prep_concentration, postPrepProgressiveMotilityPct: r.post_prep_progressive_motility, preparedBy: r.prepared_by, preparedAt: iso(r.prepared_at) };
}
function freezeFrom(r: FreezeRow): SpermFreeze {
  return { id: asId<"SpermFreeze">(r.id), patientId: r.patient_id, cryoSpecimenRef: r.cryo_specimen_ref, straws: r.straws, frozenBy: r.frozen_by, frozenAt: iso(r.frozen_at), witnessKey: r.witness_key };
}
function retrievalFrom(r: RetrievalRow): SurgicalRetrieval {
  return { id: asId<"SurgicalRetrieval">(r.id), patientId: r.patient_id, method: r.method as SurgicalRetrieval["method"], theatreBookingRef: r.theatre_booking_ref, spermFound: r.sperm_found, performedBy: r.performed_by, performedAt: iso(r.performed_at) };
}
