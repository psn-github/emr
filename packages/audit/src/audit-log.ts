import type { Clock, Result } from "@oxford/core";
import type { ChainBreak, ChainRecord } from "./chain.js";
import { HashChainLog } from "./log.js";
import type { ChainStore } from "./store.js";
import type { AuditEntryInput, AuditPayload } from "./types.js";

/**
 * The immutable, hash-chained audit log — the spine of the system. Every
 * clinical/financial mutation and every security event is recorded here with
 * who/what/when/before/after, tamper-evident by hash linkage (ADR-0003).
 */
export class AuditLog {
  private readonly log: HashChainLog<AuditPayload>;

  constructor(store: ChainStore<AuditPayload>, clock: Clock) {
    this.log = new HashChainLog(store, clock);
  }

  async record(entry: AuditEntryInput): Promise<ChainRecord<AuditPayload>> {
    return this.log.append({
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }

  /** Verify the entire audit chain is intact (used by the scheduled job). */
  async verifyIntegrity(): Promise<Result<void, ChainBreak>> {
    return this.log.verify();
  }

  async entries(): Promise<readonly ChainRecord<AuditPayload>[]> {
    return this.log.records();
  }
}
