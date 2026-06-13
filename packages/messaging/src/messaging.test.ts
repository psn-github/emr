import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validateMessageBody, validateSubject } from "./messaging.js";
import { MessagingService } from "./messaging-service.js";
import { InMemoryMessagingStore } from "./store.js";

describe("messaging validation (pure)", () => {
  it("requires a non-empty, bounded body and a subject", () => {
    expect(validateMessageBody("hello").ok).toBe(true);
    expect(detail(validateMessageBody("  "))).toBe("messaging.body_required");
    expect(detail(validateMessageBody("x".repeat(5001)))).toBe("messaging.body_too_long");
    expect(validateSubject("Question").ok).toBe(true);
    expect(detail(validateSubject(" "))).toBe("messaging.subject_required");
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new MessagingService(new InMemoryMessagingStore(), audit, events, clock) };
}

describe("MessagingService", () => {
  it("starts a thread and exchanges messages (patient ↔ staff)", async () => {
    const { svc } = build();
    const started = await svc.startThread("patient:p1", { patientId: "p1", subject: "Side effects", body: "Is bloating normal?", senderKind: "patient", senderId: "p1" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const threadId = started.value.thread.id;

    const reply = await svc.postMessage("nurse-1", { threadId, senderKind: "staff", senderId: "nurse-1", body: "Yes, mild bloating is expected." });
    expect(reply.ok).toBe(true);

    const msgs = await svc.messages(threadId);
    expect(msgs.map((m) => m.senderKind)).toEqual(["patient", "staff"]);
    expect((await svc.threadsForPatient("p1"))).toHaveLength(1);
    // lastMessageAt advances with each message (here clock is fixed, so equal)
    expect((await svc.getThread(threadId))!.subject).toBe("Side effects");
  });

  it("guards: bad subject/body on start, bad body + unknown thread on post", async () => {
    const { svc } = build();
    expect(detail(await svc.startThread("p", { patientId: "p1", subject: " ", body: "x", senderKind: "patient", senderId: "p1" }))).toBe("messaging.subject_required");
    expect(detail(await svc.startThread("p", { patientId: "p1", subject: "S", body: " ", senderKind: "patient", senderId: "p1" }))).toBe("messaging.body_required");
    expect(detail(await svc.postMessage("p", { threadId: "ghost", senderKind: "patient", senderId: "p1", body: " " }))).toBe("messaging.body_required");
    expect(detail(await svc.postMessage("p", { threadId: "ghost", senderKind: "patient", senderId: "p1", body: "hi" }))).toBe("messaging.thread.not_found");
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
