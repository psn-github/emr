import type { PushSubscription } from "./types.js";

export interface PushStore {
  saveSubscription(s: PushSubscription): Promise<void>;
  /** The active subscription for a patient+endpoint, if any. */
  byEndpoint(patientId: string, endpoint: string): Promise<PushSubscription | null>;
  activeForPatient(patientId: string): Promise<readonly PushSubscription[]>;
}

export class InMemoryPushStore implements PushStore {
  private readonly subs: PushSubscription[] = [];

  async saveSubscription(s: PushSubscription): Promise<void> {
    const idx = this.subs.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.subs[idx] = s;
    else this.subs.push(s);
  }
  async byEndpoint(patientId: string, endpoint: string): Promise<PushSubscription | null> {
    return this.subs.find((s) => s.patientId === patientId && s.endpoint === endpoint) ?? null;
  }
  async activeForPatient(patientId: string): Promise<readonly PushSubscription[]> {
    return this.subs.filter((s) => s.patientId === patientId && s.active);
  }
}
