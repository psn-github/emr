import type { Catalog } from "./types.js";

// Core bilingual seed catalog. Demonstrates RTL Arabic on foundational strings
// and gives the parity check real data. Every key MUST exist in both locales —
// assertCatalogComplete enforces it. Domain modules contribute their own
// namespaced messages, merged into this catalog.
export const coreMessages: Catalog = {
  en: {
    "app.name": "Oxford HIS",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.confirm": "Confirm",
    "language.toggle": "العربية",
    "nav.patients": "Patients",
    "nav.couples": "Couples",
    "nav.schedule": "Schedule",
    "registry.marriage.unverified": "A verified marriage record is required before any fertility workflow.",
    "auth.forbidden": "You do not have permission to perform this action.",
    "auth.mfa_required": "This action requires multi-factor authentication.",
  },
  ar: {
    "app.name": "أكسفورد للأنظمة الصحية",
    "action.save": "حفظ",
    "action.cancel": "إلغاء",
    "action.confirm": "تأكيد",
    "language.toggle": "English",
    "nav.patients": "المرضى",
    "nav.couples": "الأزواج",
    "nav.schedule": "الجدول",
    "registry.marriage.unverified": "يلزم وجود سجل زواج موثّق قبل بدء أي إجراء متعلق بالخصوبة.",
    "auth.forbidden": "ليس لديك إذن لتنفيذ هذا الإجراء.",
    "auth.mfa_required": "يتطلب هذا الإجراء مصادقة متعددة العوامل.",
  },
};
