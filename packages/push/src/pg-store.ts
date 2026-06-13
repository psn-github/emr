import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { PushSubscription } from "./types.js";
import type { PushStore } from "./store.js";

/** Postgres-backed PushStore. */
export class PgPushStore implements PushStore {
  constructor(private readonly pool: Pool) {}

  async saveSubscription(s: PushSubscription): Promise<void> {
    await this.pool.query(
      `INSERT INTO push.push_subscription (id, patient_id, endpoint, locale, created_at, active)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET locale=EXCLUDED.locale, active=EXCLUDED.active`,
      [s.id, s.patientId, s.endpoint, s.locale, s.createdAt, s.active],
    );
  }
  async byEndpoint(patientId: string, endpoint: string): Promise<PushSubscription | null> {
    const r = await this.pool.query<Row>("SELECT * FROM push.push_subscription WHERE patient_id = $1 AND endpoint = $2 LIMIT 1", [patientId, endpoint]);
    return r.rows[0] ? from(r.rows[0]) : null;
  }
  async activeForPatient(patientId: string): Promise<readonly PushSubscription[]> {
    const r = await this.pool.query<Row>("SELECT * FROM push.push_subscription WHERE patient_id = $1 AND active = true ORDER BY created_at", [patientId]);
    return r.rows.map(from);
  }
}

interface Row { id: string; patient_id: string; endpoint: string; locale: string; created_at: Date; active: boolean }
function from(r: Row): PushSubscription {
  return { id: asId<"PushSubscription">(r.id), patientId: r.patient_id, endpoint: r.endpoint, locale: r.locale as PushSubscription["locale"], createdAt: new Date(r.created_at).toISOString(), active: r.active };
}
