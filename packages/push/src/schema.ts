// Drizzle schema for the `push` domain (docs/01 §E13). Web-push subscriptions.
import { pgSchema, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const pushSchema = pgSchema("push");

export const pushSubscription = pushSchema.table(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    endpoint: text("endpoint").notNull(),
    locale: text("locale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => ({ byPatient: index("push_subscription_patient_idx").on(t.patientId) }),
);
