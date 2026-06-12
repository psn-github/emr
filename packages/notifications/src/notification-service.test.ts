import { describe, expect, it } from "vitest";
import { fixedClock, err, validationError, type Result, type AppError } from "@oxford/core";
import { I18n, assertCatalogComplete } from "@oxford/i18n";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { NotificationService } from "./notification-service.js";
import { RecordingNotificationProvider, type NotificationProvider, type SentReceipt } from "./provider.js";
import { notificationMessages } from "./messages.js";

function build(provider: NotificationProvider = new RecordingNotificationProvider()) {
  const clock = fixedClock(new Date("2026-06-12T13:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const i18n = new I18n(notificationMessages);
  const service = new NotificationService(i18n, provider, audit, events);
  return { service, audit, events, provider };
}

describe("notification templates", () => {
  it("the shipped catalog is complete (bilingual parity)", () => {
    expect(() => assertCatalogComplete(notificationMessages)).not.toThrow();
  });

  it("every template in every locale is discreet (no clinically explicit content)", () => {
    // English and Arabic forbidden terms — IVF/embryo must never appear (docs/03 §5).
    const forbiddenEn = /embryo|pregnan|IVF|ICSI|sperm|oocyte|follicl|fertil/i;
    const forbiddenAr = /جنين|أطفال الأنابيب|حيوان منوي|بويضة|إخصاب|خصوب/;
    for (const locale of ["en", "ar"] as const) {
      for (const [key, body] of Object.entries(notificationMessages[locale])) {
        expect(body, `${locale}/${key}`).not.toMatch(forbiddenEn);
        expect(body, `${locale}/${key}`).not.toMatch(forbiddenAr);
      }
    }
  });

  it("ships the agreed starter template set (7 templates)", () => {
    const ids = new Set(
      Object.keys(notificationMessages.en)
        .filter((k) => k.endsWith(".body"))
        .map((k) => k.replace(/^notif\./, "").replace(/\.body$/, "")),
    );
    expect(ids).toEqual(
      new Set([
        "appointment.reminder",
        "monitoring.next_step",
        "results.ready",
        "payment.due",
        "discharge.prescription_ready",
        "consent.awaiting_signature",
        "message.secure",
      ]),
    );
  });
});

describe("NotificationService.render", () => {
  it("interpolates the bilingual body and has no subject when none is defined", () => {
    const { service } = build();
    const msg = service.render({
      templateId: "appointment.reminder",
      channel: "sms",
      to: "+96550001122",
      locale: "ar",
      params: { date: "2026-06-15", time: "10:00" },
    });
    expect(msg.body).toContain("2026-06-15");
    expect(msg.body).toContain("10:00");
    expect(msg.subject).toBeNull();
  });

  it("includes a subject when the template defines one", () => {
    const { service } = build();
    const msg = service.render({ templateId: "results.ready", channel: "email", to: "p@x.com", locale: "en" });
    expect(msg.subject).toBe("Oxford Medical");
  });
});

describe("NotificationService.send", () => {
  it("sends via the provider and audits metadata only — no recipient or body", async () => {
    const { service, audit, events, provider } = build();
    const recording = provider as RecordingNotificationProvider;
    const r = await service.send("system", {
      templateId: "appointment.reminder",
      channel: "sms",
      to: "+96550001122",
      locale: "en",
      params: { date: "2026-06-15", time: "10:00" },
    });
    expect(r.ok).toBe(true);
    expect(recording.outbox).toHaveLength(1);

    const entry = (await audit.entries())[0]!;
    expect(entry.payload.action).toBe("CREATE");
    expect(entry.payload.after).toEqual({
      templateId: "appointment.reminder",
      channel: "sms",
      locale: "en",
      status: "sent",
    });
    // No PHI in the audit log: neither recipient nor rendered body.
    const serialized = JSON.stringify(entry.payload);
    expect(serialized).not.toContain("+96550001122");
    expect(serialized).not.toContain("2026-06-15");
    expect((await events.events())[0]!.payload.type).toBe("NotificationDispatched");
  });

  it("records a failed status and returns the error when the provider fails", async () => {
    const failing: NotificationProvider = {
      send: async (): Promise<Result<SentReceipt, AppError>> => err(validationError("provider down", "notif.provider_error")),
    };
    const { service, audit } = build(failing);
    const r = await service.send("system", { templateId: "results.ready", channel: "email", to: "p@x.com", locale: "en" });
    expect(r.ok).toBe(false);
    expect((await audit.entries())[0]!.payload.after).toMatchObject({ status: "failed" });
  });
});
