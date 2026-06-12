// Drizzle schema for the two hash-chained logs (ADR-0008, schema-per-domain:
// the `audit` schema). Append-only by policy and by migration review: no
// UPDATE/DELETE paths are generated for these tables, and the destructive-
// migration guard blocks any later attempt to drop or rewrite them.
//
// `seq` is the gapless chain position; `hash` is unique; `prev_hash` links to
// the previous row. The Postgres-backed ChainStore acquires a per-table
// advisory lock so concurrent appends cannot fork the chain.
import { pgSchema, bigint, char, index, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const auditSchema = pgSchema("audit");

export const auditLog = auditSchema.table(
  "audit_log",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => ({
    hashUnique: uniqueIndex("audit_log_hash_uq").on(t.hash),
    byEntity: index("audit_log_entity_idx").on(t.entityType, t.entityId),
  }),
);

export const domainEvent = auditSchema.table(
  "domain_event",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    type: text("type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payloadJson: jsonb("payload_json"),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => ({
    hashUnique: uniqueIndex("domain_event_hash_uq").on(t.hash),
    byAggregate: index("domain_event_aggregate_idx").on(t.aggregateType, t.aggregateId),
  }),
);
