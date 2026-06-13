import type { Result, AppError } from "@oxford/core";
import { ok, err } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { ChecklistGate } from "./ports.js";
import type { WhoChecklistStore } from "./who-store.js";
import {
  assertMayEnterTheatre,
  assertMayLeaveTheatre,
  assertPhaseItemsComplete,
  assertPhaseOrder,
  type PhaseRecord,
  type WhoChecklist,
  type WhoPhase,
} from "./who-checklist.js";

const EMPTY = (encounterId: string): WhoChecklist => ({ encounterId, sign_in: null, time_out: null, sign_out: null });

/**
 * WHO Surgical Safety Checklist service — implements the ChecklistGate the
 * journey consults. Completing a phase requires the prior phase done (in order)
 * and every required item confirmed; each completion is audited. The blocking
 * gates (enter/leave theatre) are derived from the recorded phases.
 */
export class WhoChecklistService implements ChecklistGate {
  constructor(
    private readonly store: WhoChecklistStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async completePhase(actorId: string, encounterId: string, phase: WhoPhase, confirmedItems: readonly string[], completedAt: string): Promise<Result<WhoChecklist, AppError>> {
    const checklist = (await this.store.get(encounterId)) ?? EMPTY(encounterId);
    const order = assertPhaseOrder(checklist, phase);
    if (!order.ok) return err(order.error);
    const items = assertPhaseItemsComplete(phase, confirmedItems);
    if (!items.ok) return err(items.error);
    const record: PhaseRecord = { confirmedItems, completedBy: actorId, completedAt };
    const updated: WhoChecklist = { ...checklist, [phase]: record };
    await this.store.save(updated);
    await this.audit.record({ actorId, entityType: "WhoChecklist", entityId: encounterId, action: "UPDATE", after: { phase, items: confirmedItems.length } });
    await this.events.emit({ type: "WhoChecklistPhaseCompleted", aggregateType: "SurgicalEncounter", aggregateId: encounterId, data: { phase } });
    return ok(updated);
  }

  get(encounterId: string): Promise<WhoChecklist | undefined> {
    return this.store.get(encounterId);
  }

  async assertMayEnterTheatre(encounterId: string): Promise<Result<void, AppError>> {
    return assertMayEnterTheatre((await this.store.get(encounterId)) ?? EMPTY(encounterId));
  }
  async assertMayLeaveTheatre(encounterId: string): Promise<Result<void, AppError>> {
    return assertMayLeaveTheatre((await this.store.get(encounterId)) ?? EMPTY(encounterId));
  }
}
