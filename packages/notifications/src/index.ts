// @oxford/notifications — templated, bilingual, audit-logged, provider-abstracted
// notifications (SMS/WhatsApp/email). Platform package (depends on i18n, audit, core).
export type {
  NotificationChannel,
  RenderedMessage,
  SendNotificationInput,
} from "./message.js";
export {
  type NotificationProvider,
  type SentReceipt,
  RecordingNotificationProvider,
} from "./provider.js";
export { NotificationService } from "./notification-service.js";
export { notificationMessages } from "./messages.js";
export { notificationsSchema, notificationTemplate, notificationEvent } from "./schema.js";
