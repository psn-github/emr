import type { Message, MessageThread, MessageThreadId } from "./types.js";

export interface MessagingStore {
  saveThread(t: MessageThread): Promise<void>;
  getThread(id: MessageThreadId): Promise<MessageThread | null>;
  threadsForPatient(patientId: string): Promise<readonly MessageThread[]>;
  appendMessage(m: Message): Promise<void>;
  messagesForThread(threadId: string): Promise<readonly Message[]>;
}

export class InMemoryMessagingStore implements MessagingStore {
  private readonly threads = new Map<string, MessageThread>();
  private readonly messages: Message[] = [];

  async saveThread(t: MessageThread): Promise<void> {
    this.threads.set(t.id, t);
  }
  async getThread(id: MessageThreadId): Promise<MessageThread | null> {
    return this.threads.get(id) ?? null;
  }
  async threadsForPatient(patientId: string): Promise<readonly MessageThread[]> {
    return [...this.threads.values()].filter((t) => t.patientId === patientId);
  }
  async appendMessage(m: Message): Promise<void> {
    this.messages.push(m);
  }
  async messagesForThread(threadId: string): Promise<readonly Message[]> {
    return this.messages.filter((m) => m.threadId === threadId);
  }
}
