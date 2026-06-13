import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Observation, FollowUp } from "./types.js";
import type { RecoveryStore } from "./recovery-store.js";

/** Postgres-backed RecoveryStore (observations + the discharge follow-up). */
export class PgRecoveryStore implements RecoveryStore {
  constructor(private readonly pool: Pool) {}

  async saveObservation(o: Observation): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.observation (id, encounter_id, phase, aldrete_score, systolic_bp, heart_rate, spo2, notes, recorded_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [o.id, o.encounterId, o.phase, o.aldreteScore, o.systolicBp, o.heartRate, o.spo2, o.notes, o.recordedAt, o.recordedBy],
    );
  }
  async observationsForEncounter(encounterId: string): Promise<readonly Observation[]> {
    const r = await this.pool.query<ObsRow>("SELECT * FROM perioperative.observation WHERE encounter_id = $1 ORDER BY recorded_at", [encounterId]);
    return r.rows.map(obsFrom);
  }
  async saveFollowUp(f: FollowUp): Promise<void> {
    await this.pool.query(
      `INSERT INTO perioperative.follow_up (encounter_id, id, scheduled_for, booked_by, booked_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (encounter_id) DO UPDATE SET scheduled_for=EXCLUDED.scheduled_for, booked_by=EXCLUDED.booked_by, booked_at=EXCLUDED.booked_at`,
      [f.encounterId, f.id, f.scheduledFor, f.bookedBy, f.bookedAt],
    );
  }
  async followUpForEncounter(encounterId: string): Promise<FollowUp | undefined> {
    const r = await this.pool.query<FuRow>("SELECT * FROM perioperative.follow_up WHERE encounter_id = $1", [encounterId]);
    return r.rows[0] ? fuFrom(r.rows[0]) : undefined;
  }
}

interface ObsRow { id: string; encounter_id: string; phase: string; aldrete_score: number | null; systolic_bp: number; heart_rate: number; spo2: number; notes: string; recorded_at: Date; recorded_by: string }
interface FuRow { encounter_id: string; id: string; scheduled_for: Date; booked_by: string; booked_at: Date }

const iso = (d: Date): string => new Date(d).toISOString();
function obsFrom(r: ObsRow): Observation {
  return { id: asId<"Observation">(r.id), encounterId: r.encounter_id, phase: r.phase as Observation["phase"], aldreteScore: r.aldrete_score, systolicBp: r.systolic_bp, heartRate: r.heart_rate, spo2: r.spo2, notes: r.notes, recordedAt: iso(r.recorded_at), recordedBy: r.recorded_by };
}
function fuFrom(r: FuRow): FollowUp {
  return { id: asId<"FollowUp">(r.id), encounterId: r.encounter_id, scheduledFor: iso(r.scheduled_for), bookedBy: r.booked_by, bookedAt: iso(r.booked_at) };
}
