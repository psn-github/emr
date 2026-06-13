import type { Clock } from "@oxford/core";
import { newId, asId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { PushSubscription } from "./types.js";
import type { PushStore } from "./store.js";
import type { PushProvider } from "./provider.js";
import { discreetText, type PushPrompt } from "./push.js";

/**
 * Web-push subscriptions + discreet dispatch (docs/01 §E13, ADR-0041/0042). A
 * patient subscribes a device endpoint; `dispatch` sends ONLY a discreet, no-PHI
 * prompt (from the fixed catalog) to the patient's active devices — never clinical
 * content. Subscribe/unsubscribe/dispatch are audited.
 */
export class PushService {
  constructor(
    private readonly store: PushStore,
    private readonly provider: PushProvider,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async subscribe(actorId: string, patientId: string, endpoint: string, locale: "en" | "ar"): Promise<PushSubscription> {
    const existing = await this.store.byEndpoint(patientId, endpoint);
    const sub: PushSubscription = existing
      ? { ...existing, locale, active: true }
      : { id: newId<"PushSubscription">(), patientId, endpoint, locale, createdAt: this.clock.now().toISOString(), active: true };
    await this.store.saveSubscription(sub);
    await this.audit.record({ actorId, entityType: "PushSubscription", entityId: sub.id, action: existing ? "UPDATE" : "CREATE", after: { patientId } });
    return sub;
  }

  async unsubscribe(actorId: string, patientId: string, endpoint: string): Promise<boolean> {
    const existing = await this.store.byEndpoint(patientId, endpoint);
    if (existing === null || !existing.active) return false;
    await this.store.saveSubscription({ ...existing, active: false });
    await this.audit.record({ actorId, entityType: "PushSubscription", entityId: existing.id, action: "UPDATE", after: { active: false } });
    return true;
  }

  /** Send a discreet (no-PHI) prompt to all of a patient's active devices. */
  async dispatch(actorId: string, patientId: string, prompt: PushPrompt): Promise<number> {
    const subs = await this.store.activeForPatient(patientId);
    for (const sub of subs) {
      await this.provider.send(sub.endpoint, discreetText(prompt, sub.locale));
    }
    await this.audit.record({ actorId, entityType: "PushDispatch", entityId: asId<"PushDispatch">(patientId), action: "CREATE", after: { prompt, devices: subs.length } });
    await this.events.emit({ type: "PushDispatched", aggregateType: "Patient", aggregateId: patientId, data: { prompt, devices: subs.length } });
    return subs.length;
  }

  subscriptions(patientId: string): Promise<readonly PushSubscription[]> {
    return this.store.activeForPatient(patientId);
  }
}
