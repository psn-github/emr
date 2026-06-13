// Discreet push prompts (docs/01 §E13, ADR-0042). A push NEVER carries PHI or
// clinical content — only a fixed, generic prompt that nudges the patient to open
// the secure portal. Bilingual; the catalog is the ONLY thing a push can say.
// 100% coverage — this is the no-PHI safety boundary.

export type PushPrompt = "result_available" | "payment_due" | "message_reply" | "appointment_reminder";

export interface DiscreetText {
  readonly title: string;
  readonly body: string;
}

interface PromptCopy {
  readonly title: { readonly ar: string; readonly en: string };
  readonly body: { readonly ar: string; readonly en: string };
}

/** The complete set of things a push may say — deliberately content-free. */
export const DISCREET_PROMPTS: Readonly<Record<PushPrompt, PromptCopy>> = {
  result_available: {
    title: { en: "Oxford", ar: "أكسفورد" },
    body: { en: "A new update is available in your portal.", ar: "يتوفر تحديث جديد في بوابتك." },
  },
  payment_due: {
    title: { en: "Oxford", ar: "أكسفورد" },
    body: { en: "A payment is due. Please open your portal.", ar: "يوجد دفعة مستحقة. يرجى فتح بوابتك." },
  },
  message_reply: {
    title: { en: "Oxford", ar: "أكسفورد" },
    body: { en: "You have a new message in your portal.", ar: "لديك رسالة جديدة في بوابتك." },
  },
  appointment_reminder: {
    title: { en: "Oxford", ar: "أكسفورد" },
    body: { en: "You have an upcoming appointment. See your portal.", ar: "لديك موعد قادم. راجع بوابتك." },
  },
};

/** Render a discreet prompt in the patient's locale. Never includes PHI. */
export function discreetText(prompt: PushPrompt, locale: "en" | "ar"): DiscreetText {
  const p = DISCREET_PROMPTS[prompt];
  return { title: p.title[locale], body: p.body[locale] };
}
