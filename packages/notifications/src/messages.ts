import type { Catalog } from "@oxford/i18n";

// Bilingual, DISCREET notification templates (docs/03 §5). Hard rules:
//   - No clinically explicit content in any SMS/push/WhatsApp preview.
//   - The words "IVF"/"embryo" (or their Arabic equivalents) NEVER appear.
//   - No clinical values, no cycle details — those live behind the portal login.
//
// STARTER SET — placeholder wording. The clinic will refine the copy (especially
// the Khaleeji Arabic) before go-live (tracked in docs/STATE.md, assigned to the
// product owner). Template ids / token names are the stable contract.
//
// Domain modules add their own `notif.*` keys; all merged into the app catalog
// and parity-checked (assertCatalogComplete).
export const notificationMessages: Catalog = {
  en: {
    // 1. Appointment reminder (sent T-48h and T-3h; floor/location + prep link).
    "notif.appointment.reminder.body":
      "Reminder from Oxford Medical: you have an appointment on {date} at {time}, {location}. Details: {prepLink}",
    // 2. Monitoring-visit next step (no cycle details in the preview).
    "notif.monitoring.next_step.body":
      "Oxford Medical: your next visit is booked for {date} at {time}. Please log in to the portal for details.",
    // 3. Results released (never values in the message).
    "notif.results.ready.subject": "Oxford Medical",
    "notif.results.ready.body":
      "You have a new update from Oxford Medical. Please log in to the patient portal to view it.",
    // 4. Payment due / instalment reminder.
    "notif.payment.due.body":
      "Oxford Medical: a payment of {amount} is due on {date}. Please log in to pay: {payLink}",
    // 5. Discharge prescription ready (Ground-floor pharmacy collection).
    "notif.discharge.prescription_ready.body":
      "Oxford Medical: your prescription is ready for collection at the {pharmacyLocation} pharmacy.",
    // 6. Consent awaiting signature.
    "notif.consent.awaiting_signature.body":
      "Oxford Medical: a document is awaiting your signature. Please log in to review and sign: {portalLink}",
    // 7. Generic secure-message notification.
    "notif.message.secure.body":
      "Oxford Medical: you have a new message from the clinic. Please log in to the portal to read it.",
  },
  ar: {
    "notif.appointment.reminder.body":
      "تذكير من مركز أكسفورد الطبي: لديك موعد في {date} الساعة {time}، {location}. التفاصيل: {prepLink}",
    "notif.monitoring.next_step.body":
      "مركز أكسفورد الطبي: تم حجز زيارتك القادمة في {date} الساعة {time}. يُرجى تسجيل الدخول إلى البوابة للتفاصيل.",
    "notif.results.ready.subject": "مركز أكسفورد الطبي",
    "notif.results.ready.body":
      "لديك تحديث جديد من مركز أكسفورد الطبي. يُرجى تسجيل الدخول إلى بوابة المريض للاطلاع عليه.",
    "notif.payment.due.body":
      "مركز أكسفورد الطبي: دفعة بقيمة {amount} مستحقة في {date}. يُرجى تسجيل الدخول للدفع: {payLink}",
    "notif.discharge.prescription_ready.body":
      "مركز أكسفورد الطبي: وصفتك الطبية جاهزة للاستلام من صيدلية {pharmacyLocation}.",
    "notif.consent.awaiting_signature.body":
      "مركز أكسفورد الطبي: هناك مستند بانتظار توقيعك. يُرجى تسجيل الدخول للمراجعة والتوقيع: {portalLink}",
    "notif.message.secure.body":
      "مركز أكسفورد الطبي: لديك رسالة جديدة من العيادة. يُرجى تسجيل الدخول إلى البوابة لقراءتها.",
  },
};
