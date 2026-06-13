import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { SurgicalEncounter, SurgicalEncounterId } from "./types.js";
import type { PerioperativeStore } from "./store.js";

/** Postgres-backed PerioperativeStore. The encounter's stage is updated in place
 *  (each transition is independently audited + an audited facility movement). */
export class PgPerioperativeStore implements PerioperativeStore {
  constructor(private readonly pool: Pool) {}

  async save(e: SurgicalEncounter): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.surgical_encounter (id, patient_id, indication, stage, theatre_case_ref, admitted_at, cancellation_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET stage=EXCLUDED.stage, theatre_case_ref=EXCLUDED.theatre_case_ref, cancellation_reason=EXCLUDED.cancellation_reason`,
      [e.id, e.patientId, e.indication, e.stage, e.theatreCaseRef, e.admittedAt, e.cancellationReason],
    );
  }
  async get(id: SurgicalEncounterId): Promise<SurgicalEncounter | undefined> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.surgical_encounter WHERE id = $1", [id]);
    return r.rows[0] ? from(r.rows[0]) : undefined;
  }
  async active(): Promise<readonly SurgicalEncounter[]> {
    const r = await this.pool.query<Row>("SELECT * FROM perioperative.surgical_encounter WHERE stage NOT IN ('discharged','cancelled') ORDER BY admitted_at");
    return r.rows.map(from);
  }
}

interface Row { id: string; patient_id: string; indication: string; stage: string; theatre_case_ref: string | null; admitted_at: Date; cancellation_reason: string | null }

function from(r: Row): SurgicalEncounter {
  return {
    id: asId<"SurgicalEncounter">(r.id),
    patientId: r.patient_id,
    indication: r.indication,
    stage: r.stage as SurgicalEncounter["stage"],
    theatreCaseRef: r.theatre_case_ref,
    admittedAt: new Date(r.admitted_at).toISOString(),
    cancellationReason: r.cancellation_reason,
  };
}
