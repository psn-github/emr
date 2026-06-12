import type { Locale } from "@oxford/i18n";

export type NotificationChannel = "sms" | "whatsapp" | "email";

/** A rendered, ready-to-send message. Bodies are discreet by template design:
 *  no clinically explicit content in SMS/WhatsApp previews (docs/03 §5). */
export interface RenderedMessage {
  readonly channel: NotificationChannel;
  /** Recipient address/handle. Treated as sensitive — never written to the
   *  audit log or operational logs. */
  readonly to: string;
  readonly subject: string | null;
  readonly body: string;
  readonly locale: Locale;
}

export interface SendNotificationInput {
  /** Template id; the message catalog must hold `notif.<templateId>.body`
   *  (and optionally `.subject`) in every locale. */
  readonly templateId: string;
  readonly channel: NotificationChannel;
  readonly to: string;
  readonly locale: Locale;
  readonly params?: Readonly<Record<string, string | number>>;
}
