import type { Clock, Result } from "@oxford/core";
import type { ChainBreak, ChainRecord } from "./chain.js";
import { linkRecord, verifyChain } from "./chain.js";
import { ChainConflictError, type ChainStore } from "./store.js";

// Concurrent appenders read the same head, link competing records, and all but
// one lose the store's advisory-lock race (ChainConflictError). The loser re-reads
// the now-advanced head, re-links, and tries again — optimistic-concurrency
// retry. The bound is generous: appends serialize on one lock, so this only ever
// caps a pathological burst, not normal load.
const DEFAULT_MAX_APPEND_RETRIES = 128;

/**
 * Generic append-only, hash-chained log. The audit log and the domain-event
 * log are both instances of this. Appends are linked to the current head and
 * persisted; history is never overwritten. Concurrent appends are serialized by
 * the store and retried here, so every writer's record lands (no lost audit
 * entries under load) while the chain stays strictly linear.
 */
export class HashChainLog<P> {
  constructor(
    private readonly store: ChainStore<P>,
    private readonly clock: Clock,
    private readonly maxAppendRetries = DEFAULT_MAX_APPEND_RETRIES,
  ) {}

  async append(payload: P): Promise<ChainRecord<P>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxAppendRetries; attempt++) {
      const head = await this.store.head();
      const record = linkRecord(head, this.clock.now().toISOString(), payload);
      try {
        await this.store.append(record);
        return record;
      } catch (e) {
        lastErr = e;
        // Only a concurrency conflict is retryable; anything else fails fast.
        if (!(e instanceof ChainConflictError)) throw e;
        // On a conflict, loop: re-read the now-advanced head, re-link, re-append.
        if (attempt < this.maxAppendRetries) await backoff(attempt);
      }
    }
    throw lastErr; // retries exhausted — surface the last conflict
  }

  /** Recompute and verify the whole chain. */
  async verify(): Promise<Result<void, ChainBreak>> {
    return verifyChain(await this.store.all());
  }

  async records(): Promise<readonly ChainRecord<P>[]> {
    return this.store.all();
  }
}

/** Short jittered backoff to spread out a burst of conflicting appenders so the
 *  advisory-lock queue drains instead of hot-spinning. */
function backoff(attempt: number): Promise<void> {
  const jitterMs = 1 + Math.floor(Math.random() * 4);
  const ms = Math.min(attempt, 8) + jitterMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
