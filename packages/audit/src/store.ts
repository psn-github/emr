import type { ChainRecord } from "./chain.js";

/**
 * Thrown by `ChainStore.append` when a concurrent writer advanced the head
 * between the caller's head-read and the append. RETRYABLE: the caller re-reads
 * the head, re-links, and appends again (`HashChainLog.append` does this under a
 * bounded retry). A conflict never corrupts the chain — the losing append rolls
 * back — so this is a liveness signal, not a data-integrity failure.
 */
export class ChainConflictError extends Error {}

/**
 * Append-only persistence for a hash chain. Implementations MUST:
 *  - serialize appends (the head read + write is a critical section), and
 *  - never update or delete an existing record.
 * The Postgres implementation enforces this with a per-chain advisory lock and
 * a unique, gapless sequence; the in-memory implementation is synchronous.
 */
export interface ChainStore<P> {
  /** The current last record, or null if the chain is empty. */
  head(): Promise<Pick<ChainRecord<P>, "seq" | "hash"> | null>;
  /** Append a pre-linked record. Rejects if it does not extend the head. */
  append(record: ChainRecord<P>): Promise<void>;
  /** All records in sequence order (for verification/export). */
  all(): Promise<readonly ChainRecord<P>[]>;
}

/** In-memory, append-only chain store. For tests and local development. */
export class InMemoryChainStore<P> implements ChainStore<P> {
  private readonly records: ChainRecord<P>[] = [];

  async head(): Promise<Pick<ChainRecord<P>, "seq" | "hash"> | null> {
    const last = this.records[this.records.length - 1];
    return last ? { seq: last.seq, hash: last.hash } : null;
  }

  async append(record: ChainRecord<P>): Promise<void> {
    const expectedSeq = this.records.length + 1;
    if (record.seq !== expectedSeq) {
      throw new Error(
        `append must extend the chain: expected seq ${expectedSeq}, got ${record.seq}`,
      );
    }
    this.records.push(record);
  }

  async all(): Promise<readonly ChainRecord<P>[]> {
    return [...this.records];
  }
}
