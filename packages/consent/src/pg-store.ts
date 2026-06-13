import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { PartnerAccessGrant } from "./types.js";
import type { ConsentStore } from "./store.js";

/** Postgres-backed ConsentStore. Grants are append-only (revoke = update revoked_at). */
export class PgConsentStore implements ConsentStore {
  constructor(private readonly pool: Pool) {}

  async saveGrant(g: PartnerAccessGrant): Promise<void> {
    await this.pool.query(
      `INSERT INTO consent.partner_access_grant (id, patient_id, partner_id, granted_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at`,
      [g.id, g.patientId, g.partnerId, g.grantedAt, g.revokedAt],
    );
  }
  async activeGrant(patientId: string, partnerId: string): Promise<PartnerAccessGrant | null> {
    const r = await this.pool.query<Row>("SELECT * FROM consent.partner_access_grant WHERE patient_id = $1 AND partner_id = $2 AND revoked_at IS NULL LIMIT 1", [patientId, partnerId]);
    return r.rows[0] ? from(r.rows[0]) : null;
  }
  async grantsForPatient(patientId: string): Promise<readonly PartnerAccessGrant[]> {
    const r = await this.pool.query<Row>("SELECT * FROM consent.partner_access_grant WHERE patient_id = $1 ORDER BY granted_at", [patientId]);
    return r.rows.map(from);
  }
}

interface Row { id: string; patient_id: string; partner_id: string; granted_at: Date; revoked_at: Date | null }
function from(r: Row): PartnerAccessGrant {
  return { id: asId<"PartnerAccessGrant">(r.id), patientId: r.patient_id, partnerId: r.partner_id, grantedAt: new Date(r.granted_at).toISOString(), revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at).toISOString() };
}
