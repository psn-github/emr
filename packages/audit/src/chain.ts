import type { Result } from "@oxford/core";
import { ok, err } from "@oxford/core";
import { GENESIS_HASH, computeLinkHash } from "./hash.js";

/** One immutable, hash-linked record in an append-only log. */
export interface ChainRecord<P> {
  /** 1-based, strictly increasing with no gaps. */
  readonly seq: number;
  /** ISO-8601 instant the event occurred. */
  readonly occurredAt: string;
  readonly payload: P;
  /** Hash of the previous record (GENESIS_HASH for seq 1). */
  readonly prevHash: string;
  /** Hash of this record. */
  readonly hash: string;
}

export type ChainBreakReason =
  | "seq-out-of-order"
  | "prev-hash-mismatch"
  | "hash-mismatch";

export interface ChainBreak {
  readonly seq: number;
  readonly reason: ChainBreakReason;
}

/** Build the next record to append, given the current head and a payload. */
export function linkRecord<P>(
  head: Pick<ChainRecord<P>, "seq" | "hash"> | null,
  occurredAt: string,
  payload: P,
): ChainRecord<P> {
  const seq = (head?.seq ?? 0) + 1;
  const prevHash = head?.hash ?? GENESIS_HASH;
  const hash = computeLinkHash(prevHash, seq, occurredAt, payload);
  return { seq, occurredAt, payload, prevHash, hash };
}

/**
 * Verify an entire chain is intact and tamper-free. Walks from genesis,
 * checking sequence continuity, prev-hash linkage, and recomputing every hash.
 * An empty chain is valid.
 */
export function verifyChain<P>(records: readonly ChainRecord<P>[]): Result<void, ChainBreak> {
  let expectedSeq = 1;
  let expectedPrev = GENESIS_HASH;

  for (const record of records) {
    if (record.seq !== expectedSeq) {
      return err({ seq: record.seq, reason: "seq-out-of-order" });
    }
    if (record.prevHash !== expectedPrev) {
      return err({ seq: record.seq, reason: "prev-hash-mismatch" });
    }
    const recomputed = computeLinkHash(
      record.prevHash,
      record.seq,
      record.occurredAt,
      record.payload,
    );
    if (recomputed !== record.hash) {
      return err({ seq: record.seq, reason: "hash-mismatch" });
    }
    expectedPrev = record.hash;
    expectedSeq += 1;
  }

  return ok(undefined);
}
