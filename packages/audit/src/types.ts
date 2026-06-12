// Payload shapes carried by the two hash-chained logs.

/** Auditable actions. Covers clinical/financial mutations and security events
 *  (login, failed login, permission denial, data export) per docs/02 §5. */
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "SOFT_DELETE"
  | "RESTORE"
  | "READ_EXPORT"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "PERMISSION_DENIED";

/** A single audit-log entry: who / what / when / before / after. */
export interface AuditPayload {
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  /** Prior state for mutations; null for creates and non-mutation events. */
  readonly before: unknown;
  /** New state for mutations; null for deletes and non-mutation events. */
  readonly after: unknown;
}

/** Input to record an audit entry (timestamp is supplied by the log's clock). */
export interface AuditEntryInput {
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly before?: unknown;
  readonly after?: unknown;
}

/** A domain event emitted by a module for downstream reactors (reporting,
 *  notifications, inventory, witnessing reconciliation). */
export interface DomainEventPayload {
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly data: unknown;
}
