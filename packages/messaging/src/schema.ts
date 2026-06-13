// Drizzle schema for the `messaging` domain (docs/01 §E13). Patient↔clinic
// threads + append-only messages.
import { pgSchema, text, timestamp, index } from "drizzle-orm/pg-core";

export const messagingSchema = pgSchema("messaging");

export const messageThread = messagingSchema.table(
  "message_thread",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byPatient: index("message_thread_patient_idx").on(t.patientId) }),
);

export const message = messagingSchema.table(
  "message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    senderKind: text("sender_kind").notNull(),
    senderId: text("sender_id").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ byThread: index("message_thread_idx").on(t.threadId) }),
);
