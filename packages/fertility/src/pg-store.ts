import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { CancellationCategory, Cycle, CycleId, CycleOwner } from "./types.js";
import type { CycleStore, DispositionCounts } from "./store.js";

/** Postgres-backed CycleStore. */
export class PgCycleStore implements CycleStore {
  constructor(private readonly pool: Pool) {}

  async save(c: Cycle): Promise<void> {
    const ownerId = c.owner.kind === "couple" ? c.owner.coupleId : c.owner.personId;
    await this.pool.query(
      `INSERT INTO fertility.cycle
         (id, type, owner_kind, owner_id, protocol_id, status, signed_consents,
          cancellation_reason_code, cancellation_category, cancellation_note, converted_from_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         status=EXCLUDED.status, signed_consents=EXCLUDED.signed_consents, protocol_id=EXCLUDED.protocol_id,
         cancellation_reason_code=EXCLUDED.cancellation_reason_code, cancellation_category=EXCLUDED.cancellation_category,
         cancellation_note=EXCLUDED.cancellation_note, converted_from_id=EXCLUDED.converted_from_id`,
      [c.id, c.type, c.owner.kind, ownerId, c.protocolId, c.status, JSON.stringify(c.signedConsents),
       c.cancellationReasonCode, c.cancellationCategory, c.cancellationNote, c.convertedFromId, c.createdAt],
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

  async dispositionCounts(): Promise<DispositionCounts> {
    const totals = await this.pool.query<{ started: string; cancelled: string; converted: string }>(
      `SELECT count(*)::text AS started,
              count(*) FILTER (WHERE status = 'cancelled' AND cancellation_category IS DISTINCT FROM 'converted')::text AS cancelled,
              count(*) FILTER (WHERE converted_from_id IS NOT NULL)::text AS converted
       FROM fertility.cycle`,
    );
    const byCat = await this.pool.query<{ category: string | null; n: string }>(
      `SELECT cancellation_category AS category, count(*)::text AS n
       FROM fertility.cycle
       WHERE status = 'cancelled' AND cancellation_category IS DISTINCT FROM 'converted'
       GROUP BY cancellation_category`,
    );
    const cancelledByCategory: Record<string, number> = {};
    for (const row of byCat.rows) cancelledByCategory[row.category ?? "uncoded"] = Number(row.n);
    const t = totals.rows[0]!;
    return { started: Number(t.started), cancelled: Number(t.cancelled), converted: Number(t.converted), cancelledByCategory };
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
  cancellation_reason_code: string | null;
  cancellation_category: string | null;
  cancellation_note: string | null;
  converted_from_id: string | null;
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
    cancellationReasonCode: r.cancellation_reason_code,
    cancellationCategory: r.cancellation_category as CancellationCategory | null,
    cancellationNote: r.cancellation_note,
    convertedFromId: r.converted_from_id ? asId<"Cycle">(r.converted_from_id) : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
