import type { DiscreetText } from "./push.js";

// Push transport seam (web-push / APNs / FCM are pluggable). The dispatcher only
// ever hands the provider a DISCREET (no-PHI) message + an endpoint.
export interface PushProvider {
  send(endpoint: string, text: DiscreetText): Promise<void>;
}

/** Dev/test provider: records every push sent (for assertions). */
export class RecordingPushProvider implements PushProvider {
  readonly outbox: { readonly endpoint: string; readonly title: string; readonly body: string }[] = [];
  async send(endpoint: string, text: DiscreetText): Promise<void> {
    this.outbox.push({ endpoint, title: text.title, body: text.body });
  }
}
