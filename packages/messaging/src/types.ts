import type { Id } from "@oxford/core";

// Secure patient↔clinic messaging (docs/01 §E13). Threads belong to one patient;
// messages are from the patient or staff. Content lives behind authentication
// (the secure channel) — never in push/SMS (no PHI in notifications, ADR-0042).

export type MessageThreadId = Id<"MessageThread">;
export type MessageId = Id<"Message">;
export type SenderKind = "patient" | "staff";

export interface MessageThread {
  readonly id: MessageThreadId;
  readonly patientId: string;
  readonly subject: string;
  readonly createdAt: string;
  readonly lastMessageAt: string;
}

export interface Message {
  readonly id: MessageId;
  readonly threadId: string;
  readonly senderKind: SenderKind;
  readonly senderId: string;
  readonly body: string;
  readonly sentAt: string;
}
