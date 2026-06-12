import type { Result, AppError } from "@oxford/core";
import { ok, newId } from "@oxford/core";
import type { RenderedMessage } from "./message.js";

export interface SentReceipt {
  readonly id: string;
  readonly status: "sent" | "recorded";
}

/**
 * Provider abstraction (PRD E0). SMS / WhatsApp Business / email are pluggable —
 * and every real provider that would move PHI outside the approved region must
 * be residency-reviewed before integration (docs/03 §4). No real provider is
 * wired yet; the seam keeps that decision out of the call sites.
 */
export interface NotificationProvider {
  send(message: RenderedMessage): Promise<Result<SentReceipt, AppError>>;
}

/**
 * Development/test provider: records messages, never touches a network. Lets the
 * full templating + audit path run from day one without a residency-reviewed
 * provider.
 */
export class RecordingNotificationProvider implements NotificationProvider {
  readonly outbox: RenderedMessage[] = [];

  async send(message: RenderedMessage): Promise<Result<SentReceipt, AppError>> {
    this.outbox.push(message);
    return ok({ id: newId<"Notification">(), status: "recorded" });
  }
}
