import type { Clock, Result } from "@oxford/core";
import type { ChainBreak, ChainRecord } from "./chain.js";
import { HashChainLog } from "./log.js";
import type { ChainStore } from "./store.js";
import type { DomainEventPayload } from "./types.js";

/**
 * The append-only, hash-chained domain-event log. Modules emit events here;
 * reporting, notifications, inventory, and witnessing reconciliation react to
 * them rather than being called inline (docs/02 §3).
 */
export class DomainEventLog {
  private readonly log: HashChainLog<DomainEventPayload>;

  constructor(store: ChainStore<DomainEventPayload>, clock: Clock) {
    this.log = new HashChainLog(store, clock);
  }

  async emit(event: DomainEventPayload): Promise<ChainRecord<DomainEventPayload>> {
    return this.log.append(event);
  }

  async verifyIntegrity(): Promise<Result<void, ChainBreak>> {
    return this.log.verify();
  }

  async events(): Promise<readonly ChainRecord<DomainEventPayload>[]> {
    return this.log.records();
  }
}
