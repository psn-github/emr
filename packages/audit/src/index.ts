// @oxford/audit — the append-only, hash-chained audit + domain-event spine.
// Platform package: domain modules depend on this; it depends only on @oxford/core.
export { GENESIS_HASH, computeLinkHash } from "./hash.js";
export type { ChainRecord, ChainBreak, ChainBreakReason } from "./chain.js";
export { linkRecord, verifyChain } from "./chain.js";
export type { ChainStore } from "./store.js";
export { InMemoryChainStore, ChainConflictError } from "./store.js";
export { PgAuditChainStore } from "./pg-store.js";
export { HashChainLog } from "./log.js";
export { AuditLog } from "./audit-log.js";
export { DomainEventLog } from "./event-log.js";
export type {
  AuditAction,
  AuditPayload,
  AuditEntryInput,
  DomainEventPayload,
} from "./types.js";
export {
  runChainIntegrityCheck,
  type VerifiableChain,
  type ChainIntegrityResult,
  type IntegrityReport,
} from "./verify-job.js";
export { auditSchema, auditLog, domainEvent } from "./schema.js";
