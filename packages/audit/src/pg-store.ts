import type { Pool } from "pg";
import type { ChainRecord } from "./chain.js";
import { ChainConflictError, type ChainStore } from "./store.js";
import { GENESIS_HASH } from "./hash.js";
import type { AuditPayload } from "./types.js";

// Advisory-lock key for the audit_log chain. Appends serialize on this lock so
// concurrent writers cannot fork the chain (two rows claiming the same seq /
// prev_hash). The lock is transaction-scoped.
const AUDIT_LOG_LOCK_KEY = 0x0a0d_17_01;

/**
 * Postgres-backed, append-only ChainStore for the audit_log table. No UPDATE or
 * DELETE is ever issued here — only INSERT and SELECT. Appends re-validate the
 * head under an advisory lock and reject anything that does not extend the chain,
 * so the hash chain stays linear even under concurrency (caller retries on the
 * resulting conflict).
 */
export class PgAuditChainStore implements ChainStore<AuditPayload> {
  constructor(private readonly pool: Pool) {}

  async head(): Promise<Pick<ChainRecord<AuditPayload>, "seq" | "hash"> | null> {
    const res = await this.pool.query<{ seq: string; hash: string }>(
      "SELECT seq, hash FROM audit.audit_log ORDER BY seq DESC LIMIT 1",
    );
    const row = res.rows[0];
    return row ? { seq: Number(row.seq), hash: row.hash } : null;
  }

  async append(record: ChainRecord<AuditPayload>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOG_LOCK_KEY]);

      const head = await client.query<{ seq: string; hash: string }>(
        "SELECT seq, hash FROM audit.audit_log ORDER BY seq DESC LIMIT 1",
      );
      const curSeq = head.rows[0] ? Number(head.rows[0].seq) : 0;
      const expectedPrev = head.rows[0] ? head.rows[0].hash : GENESIS_HASH;
      if (record.seq !== curSeq + 1 || record.prevHash !== expectedPrev) {
        throw new ChainConflictError(
          `append must extend the chain head (have seq ${curSeq}); concurrent append — retry`,
        );
      }

      const p = record.payload;
      await client.query(
        `INSERT INTO audit.audit_log
           (seq, occurred_at, actor_id, entity_type, entity_id, action, before_json, after_json, prev_hash, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          record.seq,
          record.occurredAt,
          p.actorId,
          p.entityType,
          p.entityId,
          p.action,
          p.before === null ? null : JSON.stringify(p.before),
          p.after === null ? null : JSON.stringify(p.after),
          record.prevHash,
          record.hash,
        ],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async all(): Promise<readonly ChainRecord<AuditPayload>[]> {
    const res = await this.pool.query<AuditRow>(
      "SELECT * FROM audit.audit_log ORDER BY seq ASC",
    );
    return res.rows.map(rowToRecord);
  }
}

interface AuditRow {
  seq: string;
  occurred_at: Date;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  prev_hash: string;
  hash: string;
}

function rowToRecord(row: AuditRow): ChainRecord<AuditPayload> {
  return {
    seq: Number(row.seq),
    occurredAt: new Date(row.occurred_at).toISOString(),
    prevHash: row.prev_hash,
    hash: row.hash,
    payload: {
      actorId: row.actor_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action as AuditPayload["action"],
      before: row.before_json ?? null,
      after: row.after_json ?? null,
    },
  };
}
