import type { Result, AppError } from "@oxford/core";
import { ok, err } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { I18n } from "@oxford/i18n";
import type { RenderedMessage, SendNotificationInput } from "./message.js";
import type { NotificationProvider, SentReceipt } from "./provider.js";

/**
 * Templated, bilingual, audit-logged notifications. Renders the message from the
 * i18n catalog (so there are no hardcoded strings and previews stay discreet),
 * sends via the pluggable provider, and records a NotificationEvent. The
 * recipient address and rendered body are NEVER written to the audit log (no PHI
 * in logs) — only the template id, channel, locale, and delivery status.
 */
export class NotificationService {
  constructor(
    private readonly i18n: I18n,
    private readonly provider: NotificationProvider,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  render(input: SendNotificationInput): RenderedMessage {
    const body = this.i18n.t(`notif.${input.templateId}.body`, input.locale, input.params);
    const subjectKey = `notif.${input.templateId}.subject`;
    const subject = this.i18n.has(subjectKey, input.locale)
      ? this.i18n.t(subjectKey, input.locale, input.params)
      : null;
    return { channel: input.channel, to: input.to, subject, body, locale: input.locale };
  }

  async send(
    actorId: string,
    input: SendNotificationInput,
  ): Promise<Result<SentReceipt, AppError>> {
    const message = this.render(input);
    const result = await this.provider.send(message);
    const status = result.ok ? "sent" : "failed";

    await this.audit.record({
      actorId,
      entityType: "Notification",
      entityId: input.templateId,
      action: "CREATE",
      // Metadata only — no recipient, no rendered body.
      after: { templateId: input.templateId, channel: input.channel, locale: input.locale, status },
    });
    await this.events.emit({
      type: "NotificationDispatched",
      aggregateType: "Notification",
      aggregateId: input.templateId,
      data: { channel: input.channel, status },
    });

    if (!result.ok) return err(result.error);
    return ok(result.value);
  }
}
