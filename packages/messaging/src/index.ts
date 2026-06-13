// @oxford/messaging — secure patient↔clinic messaging (docs/01 §E13). Domain
// module: core + audit. Threads + append-only messages; content stays behind
// authentication (never in notifications). Own-data/assignment scoping at the API.
export type { MessageThreadId, MessageId, SenderKind, MessageThread, Message } from "./types.js";
export { validateMessageBody, validateSubject } from "./messaging.js";
export { type MessagingStore, InMemoryMessagingStore } from "./store.js";
export { PgMessagingStore } from "./pg-store.js";
export { MessagingService, type StartThreadInput, type PostMessageInput } from "./messaging-service.js";
export { messagingSchema, messageThread, message } from "./schema.js";
