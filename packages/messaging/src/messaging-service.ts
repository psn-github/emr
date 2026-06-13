import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Message, MessageThread, MessageThreadId, SenderKind } from "./types.js";
import type { MessagingStore } from "./store.js";
import { validateMessageBody, validateSubject } from "./messaging.js";

export interface StartThreadInput {
  readonly patientId: string;
  readonly subject: string;
  readonly body: string;
  readonly senderKind: SenderKind;
  readonly senderId: string;
}
export interface PostMessageInput {
  readonly threadId: string;
  readonly senderKind: SenderKind;
  readonly senderId: string;
  readonly body: string;
}

/**
 * Secure patient↔clinic messaging (docs/01 §E13). Threads belong to one patient;
 * messages are append-only and audited (clinical communication). Content stays
 * behind authentication — never surfaced in notifications. Own-data/assignment
 * scoping is enforced at the API.
 */
export class MessagingService {
  constructor(
    private readonly store: MessagingStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async startThread(actorId: string, input: StartThreadInput): Promise<Result<{ thread: MessageThread; message: Message }, AppError>> {
    const s = validateSubject(input.subject);
    if (!s.ok) return err(s.error);
    const b = validateMessageBody(input.body);
    if (!b.ok) return err(b.error);
    const now = this.clock.now().toISOString();
    const thread: MessageThread = { id: newId<"MessageThread">(), patientId: input.patientId, subject: input.subject, createdAt: now, lastMessageAt: now };
    await this.store.saveThread(thread);
    const message = await this.append(actorId, thread.id, input.senderKind, input.senderId, input.body, now);
    await this.events.emit({ type: "MessageThreadStarted", aggregateType: "MessageThread", aggregateId: thread.id, data: { patientId: input.patientId } });
    return ok({ thread, message });
  }

  async postMessage(actorId: string, input: PostMessageInput): Promise<Result<Message, AppError>> {
    const b = validateMessageBody(input.body);
    if (!b.ok) return err(b.error);
    const thread = await this.store.getThread(asId<"MessageThread">(input.threadId));
    if (thread === null) return err(notFound("thread not found", "messaging.thread.not_found"));
    const now = this.clock.now().toISOString();
    const message = await this.append(actorId, thread.id, input.senderKind, input.senderId, input.body, now);
    await this.store.saveThread({ ...thread, lastMessageAt: now });
    return ok(message);
  }

  threadsForPatient(patientId: string): Promise<readonly MessageThread[]> {
    return this.store.threadsForPatient(patientId);
  }
  getThread(id: MessageThreadId): Promise<MessageThread | null> {
    return this.store.getThread(id);
  }
  messages(threadId: string): Promise<readonly Message[]> {
    return this.store.messagesForThread(threadId);
  }

  private async append(actorId: string, threadId: string, senderKind: SenderKind, senderId: string, body: string, at: string): Promise<Message> {
    const message: Message = { id: newId<"Message">(), threadId, senderKind, senderId, body, sentAt: at };
    await this.store.appendMessage(message);
    await this.audit.record({ actorId, entityType: "Message", entityId: message.id, action: "CREATE", after: { threadId, senderKind } });
    await this.events.emit({ type: "MessageSent", aggregateType: "MessageThread", aggregateId: threadId, data: { senderKind } });
    return message;
  }
}
