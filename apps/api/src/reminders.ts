import type { NotificationService } from "@oxford/notifications";

// Bilingual appointment reminders, dispatched via the (stubbed) notification
// provider at a configurable cadence — T-48h and T-3h by default. Pure planning
// + due-selection (idempotent via a "sent" set); the discreet template carries
// no clinical detail (enforced in @oxford/notifications).

export const DEFAULT_CADENCE_HRS = [48, 3] as const;
const HOUR_MS = 3_600_000;

export interface ReminderTarget {
  readonly apptId: string;
  readonly patientId: string;
  readonly startAt: string; // ISO
  readonly to: string;
  readonly locale: "en" | "ar";
  readonly location: string;
}

export interface DueReminder {
  readonly target: ReminderTarget;
  readonly offsetHrs: number;
  readonly key: string; // `${apptId}:${offsetHrs}` — idempotency key
}

/** When each reminder for a target should fire. */
export function plannedReminders(target: ReminderTarget, cadenceHrs: readonly number[]): { key: string; fireAt: string; offsetHrs: number }[] {
  const start = Date.parse(target.startAt);
  return cadenceHrs.map((h) => ({
    key: `${target.apptId}:${h}`,
    offsetHrs: h,
    fireAt: new Date(start - h * HOUR_MS).toISOString(),
  }));
}

/** Reminders that are due now: fireAt ≤ now < startAt and not already sent. */
export function dueReminders(
  targets: readonly ReminderTarget[],
  cadenceHrs: readonly number[],
  now: Date,
  sent: ReadonlySet<string>,
): DueReminder[] {
  const nowMs = now.getTime();
  const due: DueReminder[] = [];
  for (const target of targets) {
    const startMs = Date.parse(target.startAt);
    if (nowMs >= startMs) continue; // don't remind after the appointment
    for (const plan of plannedReminders(target, cadenceHrs)) {
      if (Date.parse(plan.fireAt) <= nowMs && !sent.has(plan.key)) {
        due.push({ target, offsetHrs: plan.offsetHrs, key: plan.key });
      }
    }
  }
  return due;
}

/** Dispatch due reminders via the notification service; returns the keys sent. */
export async function dispatchDueReminders(
  notifications: NotificationService,
  actorId: string,
  due: readonly DueReminder[],
): Promise<string[]> {
  const sent: string[] = [];
  for (const r of due) {
    const [date, timeWithZ] = r.target.startAt.split("T");
    const time = (timeWithZ ?? "").slice(0, 5);
    const result = await notifications.send(actorId, {
      templateId: "appointment.reminder",
      channel: "sms",
      to: r.target.to,
      locale: r.target.locale,
      params: { date: date ?? "", time, location: r.target.location, prepLink: "portal" },
    });
    if (result.ok) sent.push(r.key);
  }
  return sent;
}
