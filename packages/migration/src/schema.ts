// Drizzle schema for the `migration` import ledger (ADR-0008). Tracks which
// source records have been imported (idempotent, re-runnable migration).
import { pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const migrationSchema = pgSchema("migration");

export const importLedger = migrationSchema.table(
  "import_ledger",
  {
    sourceSystem: text("source_system").notNull(),
    entity: text("entity").notNull(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sourceSystem, t.entity, t.sourceId] }) }),
);
