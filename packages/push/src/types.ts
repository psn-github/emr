import type { Id } from "@oxford/core";

// Web-push subscriptions for the PWA (docs/01 §E13, ADR-0041). A patient registers
// the browser/device endpoint; dispatch sends only discreet prompts (no PHI).

export type PushSubscriptionId = Id<"PushSubscription">;

export interface PushSubscription {
  readonly id: PushSubscriptionId;
  readonly patientId: string;
  readonly endpoint: string;
  readonly locale: "en" | "ar";
  readonly createdAt: string;
  readonly active: boolean;
}
