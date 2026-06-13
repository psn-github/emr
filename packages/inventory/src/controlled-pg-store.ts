import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { CdMovement } from "./types.js";
import type { CdMovementType } from "./controlled.js";
import type { ControlledRegisterStore } from "./controlled-store.js";

/** Postgres-backed controlled-drugs register. Append-only: inserts only. */
export class PgControlledRegisterStore implements ControlledRegisterStore {
  constructor(private readonly pool: Pool) {}

  async appendMovement(m: CdMovement): Promise<void> {
    await this.pool.query(
      `INSERT INTO inventory.cd_movement (id, item_id, lot_no, type, quantity, balance_after, reason, patient_ref, actor_id, witnessed_by, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.itemId, m.lotNo, m.type, m.quantity, m.balanceAfter, m.reason, m.patientRef, m.actorId, m.witnessedBy, m.occurredAt],
    );
  }
  async movementsForItem(itemId: string): Promise<readonly CdMovement[]> {
    const r = await this.pool.query<CdRow>("SELECT * FROM inventory.cd_movement WHERE item_id = $1 ORDER BY seq", [itemId]);
    return r.rows.map(cdFrom);
  }
}

interface CdRow { id: string; item_id: string; lot_no: string; type: string; quantity: number; balance_after: number; reason: string; patient_ref: string | null; actor_id: string; witnessed_by: string; occurred_at: Date }

function cdFrom(r: CdRow): CdMovement {
  return {
    id: asId<"CdMovement">(r.id),
    itemId: r.item_id,
    lotNo: r.lot_no,
    type: r.type as CdMovementType,
    quantity: r.quantity,
    balanceAfter: r.balance_after,
    reason: r.reason,
    patientRef: r.patient_ref,
    actorId: r.actor_id,
    witnessedBy: r.witnessed_by,
    occurredAt: new Date(r.occurred_at).toISOString(),
  };
}
