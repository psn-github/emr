import type { Catalog } from "@oxford/i18n";

// Bilingual, DISCREET notification templates (docs/03 §5: no clinically explicit
// content in previews; notifications must not reveal infertility-sensitive
// detail). Domain modules add their own `notif.*` keys; all merged into the
// app catalog and parity-checked (assertCatalogComplete).
export const notificationMessages: Catalog = {
  en: {
    "notif.appointment.reminder.body":
      "Reminder from Oxford Medical: you have an appointment on {date} at {time}.",
    "notif.results.ready.subject": "Oxford Medical",
    "notif.results.ready.body":
      "You have a new update from Oxford Medical. Please log in to the patient portal to view it.",
    "notif.payment.due.body":
      "Oxford Medical: an instalment of {amount} is due on {date}. Please log in to pay.",
  },
  ar: {
    "notif.appointment.reminder.body":
      "تذكير من مركز أكسفورد الطبي: لديك موعد في {date} الساعة {time}.",
    "notif.results.ready.subject": "مركز أكسفورد الطبي",
    "notif.results.ready.body":
      "لديك تحديث جديد من مركز أكسفورد الطبي. يُرجى تسجيل الدخول إلى بوابة المريض للاطلاع عليه.",
    "notif.payment.due.body":
      "مركز أكسفورد الطبي: قسط بقيمة {amount} مستحق في {date}. يُرجى تسجيل الدخول للدفع.",
  },
};
