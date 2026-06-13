import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Cycle, CycleId, CycleOwner } from "./types.js";
import type { CycleStore } from "./store.js";

/** Postgres-backed CycleStore. */
export class PgCycleStore implements CycleStore {
  constructor(private readonly pool: Pool) {}

  async save(c: Cycle): Promise<void> {
    const ownerId = c.owner.kind === "couple" ? c.owner.coupleId : c.owner.personId;
    await this.pool.query(
      `INSERT INTO fertility.cycle (id, type, owner_kind, owner_id, protocol_id, status, signed_consents, cancellation_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, signed_consents=EXCLUDED.signed_consents, cancellation_reason=EXCLUDED.cancellation_reason, protocol_id=EXCLUDED.protocol_id`,
      [c.id, c.type, c.owner.kind, ownerId, c.protocolId, c.status, JSON.stringify(c.signedConsents), c.cancellationReason, c.createdAt],
    );
  }

  async get(id: CycleId): Promise<Cycle | null> {
    const r = await this.pool.query<CycleRow>("SELECT * FROM fertility.cycle WHERE id = $1", [id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }

  async listForOwner(ownerId: string): Promise<readonly Cycle[]> {
    const r = await this.pool.query<CycleRow>("SELECT * FROM fertility.cycle WHERE owner_id = $1 ORDER BY created_at", [ownerId]);
    return r.rows.map(fromRow);
  }
}

interface CycleRow {
  id: string;
  type: string;
  owner_kind: string;
  owner_id: string;
  protocol_id: string | null;
  status: string;
  signed_consents: string[];
  cancellation_reason: string | null;
  created_at: Date;
}

function fromRow(r: CycleRow): Cycle {
  const owner: CycleOwner = r.owner_kind === "couple" ? { kind: "couple", coupleId: r.owner_id } : { kind: "person", personId: r.owner_id };
  return {
    id: asId<"Cycle">(r.id),
    type: r.type as Cycle["type"],
    owner,
    protocolId: r.protocol_id,
    status: r.status as Cycle["status"],
    signedConsents: r.signed_consents,
    cancellationReason: r.cancellation_reason,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
