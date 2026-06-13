import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Message, MessageThread, MessageThreadId } from "./types.js";
import type { MessagingStore } from "./store.js";

/** Postgres-backed MessagingStore. Messages are append-only inserts. */
export class PgMessagingStore implements MessagingStore {
  constructor(private readonly pool: Pool) {}

  async saveThread(t: MessageThread): Promise<void> {
    await this.pool.query(
      `INSERT INTO messaging.message_thread (id, patient_id, subject, created_at, last_message_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET last_message_at=EXCLUDED.last_message_at`,
      [t.id, t.patientId, t.subject, t.createdAt, t.lastMessageAt],
    );
  }
  async getThread(id: MessageThreadId): Promise<MessageThread | null> {
    const r = await this.pool.query<ThreadRow>("SELECT * FROM messaging.message_thread WHERE id = $1", [id]);
    return r.rows[0] ? threadFrom(r.rows[0]) : null;
  }
  async threadsForPatient(patientId: string): Promise<readonly MessageThread[]> {
    const r = await this.pool.query<ThreadRow>("SELECT * FROM messaging.message_thread WHERE patient_id = $1 ORDER BY last_message_at DESC", [patientId]);
    return r.rows.map(threadFrom);
  }
  async appendMessage(m: Message): Promise<void> {
    await this.pool.query(
      `INSERT INTO messaging.message (id, thread_id, sender_kind, sender_id, body, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.threadId, m.senderKind, m.senderId, m.body, m.sentAt],
    );
  }
  async messagesForThread(threadId: string): Promise<readonly Message[]> {
    const r = await this.pool.query<MsgRow>("SELECT * FROM messaging.message WHERE thread_id = $1 ORDER BY sent_at", [threadId]);
    return r.rows.map(msgFrom);
  }
}

interface ThreadRow { id: string; patient_id: string; subject: string; created_at: Date; last_message_at: Date }
interface MsgRow { id: string; thread_id: string; sender_kind: string; sender_id: string; body: string; sent_at: Date }

function threadFrom(r: ThreadRow): MessageThread {
  return { id: asId<"MessageThread">(r.id), patientId: r.patient_id, subject: r.subject, createdAt: new Date(r.created_at).toISOString(), lastMessageAt: new Date(r.last_message_at).toISOString() };
}
function msgFrom(r: MsgRow): Message {
  return { id: asId<"Message">(r.id), threadId: r.thread_id, senderKind: r.sender_kind as Message["senderKind"], senderId: r.sender_id, body: r.body, sentAt: new Date(r.sent_at).toISOString() };
}
