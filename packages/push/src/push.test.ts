import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { DISCREET_PROMPTS, discreetText, type PushPrompt } from "./push.js";
import { PushService } from "./push-service.js";
import { InMemoryPushStore } from "./store.js";
import { RecordingPushProvider } from "./provider.js";

const PHI = /IVF|ICSI|embryo|pregnan|fertil|جنين|حمل/i;

describe("discreet prompts (pure)", () => {
  it("renders bilingual, content-free prompts (no PHI)", () => {
    const en = discreetText("result_available", "en");
    expect(en.body).toBe("A new update is available in your portal.");
    expect(discreetText("payment_due", "ar").body).toContain("دفعة");
    // every prompt in the catalog is free of clinical terms
    for (const key of Object.keys(DISCREET_PROMPTS) as PushPrompt[]) {
      for (const loc of ["en", "ar"] as const) {
        const t = discreetText(key, loc);
        expect(PHI.test(t.title + " " + t.body)).toBe(false);
      }
    }
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const provider = new RecordingPushProvider();
  return { svc: new PushService(new InMemoryPushStore(), provider, audit, events, clock), provider };
}

describe("PushService", () => {
  it("subscribes devices and dispatches a discreet prompt to each", async () => {
    const { svc, provider } = build();
    await svc.subscribe("patient:p1", "p1", "https://push/a", "en");
    await svc.subscribe("patient:p1", "p1", "https://push/b", "ar");
    // re-subscribing the same endpoint updates (no duplicate)
    await svc.subscribe("patient:p1", "p1", "https://push/a", "en");
    expect(await svc.subscriptions("p1")).toHaveLength(2);

    const sent = await svc.dispatch("system", "p1", "result_available");
    expect(sent).toBe(2);
    expect(provider.outbox).toHaveLength(2);
    // the en device got the en copy, the ar device the ar copy — and NO PHI
    expect(provider.outbox.find((o) => o.endpoint.endsWith("/a"))!.body).toBe("A new update is available in your portal.");
    expect(provider.outbox.find((o) => o.endpoint.endsWith("/b"))!.body).toContain("بوابتك");
    expect(provider.outbox.every((o) => !PHI.test(o.body))).toBe(true);
  });

  it("unsubscribe stops dispatch to that device", async () => {
    const { svc, provider } = build();
    await svc.subscribe("p", "p1", "https://push/a", "en");
    expect(await svc.unsubscribe("p", "p1", "https://push/a")).toBe(true);
    expect(await svc.unsubscribe("p", "p1", "https://push/a")).toBe(false); // already inactive
    expect(await svc.unsubscribe("p", "p1", "https://push/missing")).toBe(false); // unknown
    expect(await svc.dispatch("system", "p1", "message_reply")).toBe(0);
    expect(provider.outbox).toHaveLength(0);
  });
});
