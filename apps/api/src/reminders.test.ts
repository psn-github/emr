import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { I18n, type Catalog } from "@oxford/i18n";
import { NotificationService, RecordingNotificationProvider, notificationMessages } from "@oxford/notifications";
import { DEFAULT_CADENCE_HRS, dueReminders, plannedReminders, dispatchDueReminders, type ReminderTarget } from "./reminders.js";

const target: ReminderTarget = {
  apptId: "appt-1",
  patientId: "pat-1",
  startAt: "2026-06-15T09:00:00.000Z",
  to: "+96550001122",
  locale: "ar",
  location: "L3",
};

describe("reminder planning", () => {
  it("plans one reminder per cadence step (T-48h, T-3h)", () => {
    const planned = plannedReminders(target, DEFAULT_CADENCE_HRS);
    expect(planned.map((p) => p.offsetHrs)).toEqual([48, 3]);
    expect(planned[0]!.fireAt).toBe("2026-06-13T09:00:00.000Z"); // 48h before
    expect(planned[1]!.fireAt).toBe("2026-06-15T06:00:00.000Z"); // 3h before
  });

  it("selects due reminders within the window, skipping already-sent and post-start", () => {
    // now = T-3h exactly: both the 48h and 3h reminders are due.
    const now = new Date("2026-06-15T06:00:00.000Z");
    const due = dueReminders([target], DEFAULT_CADENCE_HRS, now, new Set());
    expect(due.map((d) => d.offsetHrs).sort((a, b) => a - b)).toEqual([3, 48]);
    // already sent the 48h one → only 3h remains.
    const due2 = dueReminders([target], DEFAULT_CADENCE_HRS, now, new Set(["appt-1:48"]));
    expect(due2.map((d) => d.offsetHrs)).toEqual([3]);
    // after the appointment start → nothing.
    expect(dueReminders([target], DEFAULT_CADENCE_HRS, new Date("2026-06-15T09:30:00Z"), new Set())).toHaveLength(0);
    // well before any fire time → nothing.
    expect(dueReminders([target], DEFAULT_CADENCE_HRS, new Date("2026-06-01T00:00:00Z"), new Set())).toHaveLength(0);
  });
});

describe("reminder dispatch (bilingual, discreet, via stubbed provider)", () => {
  function notifications() {
    const clock = fixedClock(new Date("2026-06-15T06:00:00.000Z"));
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const catalog: Catalog = { en: { ...notificationMessages.en }, ar: { ...notificationMessages.ar } };
    const outbox = new RecordingNotificationProvider();
    return { svc: new NotificationService(new I18n(catalog), outbox, audit, events), outbox };
  }

  it("dispatches due reminders and returns their idempotency keys", async () => {
    const { svc, outbox } = notifications();
    const now = new Date("2026-06-15T06:00:00.000Z");
    const due = dueReminders([target], DEFAULT_CADENCE_HRS, now, new Set(["appt-1:48"]));
    const sent = await dispatchDueReminders(svc, "system", due);
    expect(sent).toEqual(["appt-1:3"]);
    expect(outbox.outbox).toHaveLength(1);
    // Discreet: no clinical content in the reminder body.
    expect(outbox.outbox[0]!.body).not.toMatch(/IVF|embryo|جنين|أطفال الأنابيب/i);
    expect(outbox.outbox[0]!.body).toContain("2026-06-15"); // date interpolated
  });
});
