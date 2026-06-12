import type { Clock, Result } from "@oxford/core";
import type { ChainBreak, ChainRecord } from "./chain.js";
import { linkRecord, verifyChain } from "./chain.js";
import type { ChainStore } from "./store.js";

/**
 * Generic append-only, hash-chained log. The audit log and the domain-event
 * log are both instances of this. Appends are linked to the current head and
 * persisted; history is never overwritten.
 */
export class HashChainLog<P> {
  constructor(
    private readonly store: ChainStore<P>,
    private readonly clock: Clock,
  ) {}

  async append(payload: P): Promise<ChainRecord<P>> {
    const head = await this.store.head();
    const record = linkRecord(head, this.clock.now().toISOString(), payload);
    await this.store.append(record);
    return record;
  }

  /** Recompute and verify the whole chain. */
  async verify(): Promise<Result<void, ChainBreak>> {
    return verifyChain(await this.store.all());
  }

  async records(): Promise<readonly ChainRecord<P>[]> {
    return this.store.all();
  }
}
