// Drizzle schema for the `fertility` domain (ADR-0008). Owner is person OR couple
// (preservation vs treatment). Protocols are config (seeded). Stimulation
// charting / dosing tables land in PR 2.2.
import { pgSchema, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";

export const fertilitySchema = pgSchema("fertility");

export const cycle = fertilitySchema.table(
  "cycle",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    ownerKind: text("owner_kind").notNull(), // 'couple' | 'person'
    ownerId: text("owner_id").notNull(),
    protocolId: text("protocol_id"),
    status: text("status").notNull().default("planned"),
    signedConsents: jsonb("signed_consents").$type<string[]>().notNull().default([]),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byOwner: index("cycle_owner_idx").on(t.ownerId) }),
);

export const protocol = fertilitySchema.table("protocol", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  appliesTo: jsonb("applies_to").$type<string[]>().notNull().default([]),
});
