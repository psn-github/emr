// Drizzle schema for the `notifications` domain (ADR-0008). Templates are
// versioned config (docs/02 §1). The event log records delivery WITHOUT the
// recipient or rendered body (no PHI in logs) — those are not columns here.
import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const notificationsSchema = pgSchema("notifications");

export const notificationTemplate = notificationsSchema.table("notification_template", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  description: text("description"),
});

export const notificationEvent = notificationsSchema.table("notification_event", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  channel: text("channel").notNull(),
  locale: text("locale").notNull(),
  status: text("status").notNull(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull(),
});
