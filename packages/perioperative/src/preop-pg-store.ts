import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { PreOpAssessment } from "./types.js";
import type { PreOpStore } from "./preop-store.js";

/** Postgres-backed PreOpStore (one assessment per encounter). */
export class PgPreOpStore implements PreOpStore {
  constructor(private readonly pool: Pool) {}

  async save(a: PreOpAssessment): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.preop_assessment
         (id, encounter_id, anaesthetic_history, mallampati_class, asa_grade, investigations, fasting_confirmed, consent_ref, assessed_by, assessed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (encounter_id) DO UPDATE SET
         anaesthetic_history=EXCLUDED.anaesthetic_history, mallampati_class=EXCLUDED.mallampati_class,
         asa_grade=EXCLUDED.asa_grade, investigations=EXCLUDED.investigations,
         fasting_confirmed=EXCLUDED.fasting_confirmed, consent_ref=EXCLUDED.consent_ref,
         assessed_by=EXCLUDED.assessed_by, assessed_at=EXCLUDED.assessed_at`,
      [a.id, a.encounterId, a.anaestheticHistory, a.mallampatiClass, a.asaGrade, JSON.stringify(a.investigations), a.fastingConfirmed, a.consentRef, a.assessedBy, a.assessedAt],
    );
  }
  async forEncounter(encounterId: string): Promise<PreOpAssessment | undefined> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.preop_assessment WHERE encounter_id = $1", [encounterId]);
    return r.rows[0] ? from(r.rows[0]) : undefined;
  }
}

interface Row {
  id: string; encounter_id: string; anaesthetic_history: string; mallampati_class: number; asa_grade: number;
  investigations: string[]; fasting_confirmed: boolean; consent_ref: string; assessed_by: string; assessed_at: Date;
}
function from(r: Row): PreOpAssessment {
  return {
    id: asId<"PreOpAssessment">(r.id),
    encounterId: r.encounter_id,
    anaestheticHistory: r.anaesthetic_history,
    mallampatiClass: r.mallampati_class,
    asaGrade: r.asa_grade,
    investigations: r.investigations,
    fastingConfirmed: r.fasting_confirmed,
    consentRef: r.consent_ref,
    assessedBy: r.assessed_by,
    assessedAt: new Date(r.assessed_at).toISOString(),
  };
}
