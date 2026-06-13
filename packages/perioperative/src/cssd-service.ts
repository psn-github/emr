import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { InstrumentSet, InstrumentSetId, SterilisationCycle, SetUsage } from "./types.js";
import type { CssdStore } from "./cssd-store.js";
import { assertSetUsable, statusAfterSterilisation, type SterilisationResult } from "./cssd.js";

export interface RecordSterilisationInput {
  readonly cycleType: string;
  readonly loadRef: string;
  readonly result: SterilisationResult;
  readonly completedAt: string;
}

export interface SetHistory {
  readonly set: InstrumentSet;
  readonly cycles: readonly SterilisationCycle[];
  readonly usages: readonly SetUsage[];
}

/**
 * CSSD / instrument-set tracking. A set's composition is registered; each
 * sterilisation cycle is recorded (pass → sterile, fail → dirty); a set may only
 * be used on a patient when sterile, and using it marks it used (must be
 * reprocessed before reuse). Every use links set → patient → the sterilisation
 * cycle that made it sterile — full traceability.
 */
export class CssdService {
  constructor(
    private readonly store: CssdStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async registerSet(actorId: string, name: string, composition: readonly string[]): Promise<InstrumentSet> {
    const set: InstrumentSet = { id: newId<"InstrumentSet">(), name, composition, status: "dirty" };
    await this.store.saveSet(set);
    await this.audit.record({ actorId, entityType: "InstrumentSet", entityId: set.id, action: "CREATE", after: { name, items: composition.length } });
    return set;
  }

  async recordSterilisation(actorId: string, setId: InstrumentSetId, input: RecordSterilisationInput): Promise<Result<SterilisationCycle, AppError>> {
    const set = await this.store.getSet(setId);
    if (set === undefined) return err(notFound("instrument set not found", "perioperative.cssd.set_not_found"));
    const cycle: SterilisationCycle = { id: newId<"SterilisationCycle">(), setId, cycleType: input.cycleType, loadRef: input.loadRef, result: input.result, completedAt: input.completedAt, operator: actorId };
    await this.store.saveCycle(cycle);
    const updated: InstrumentSet = { ...set, status: statusAfterSterilisation(input.result) };
    await this.store.saveSet(updated);
    await this.audit.record({ actorId, entityType: "SterilisationCycle", entityId: cycle.id, action: "CREATE", after: { setId, result: input.result } });
    await this.events.emit({ type: "SterilisationRecorded", aggregateType: "InstrumentSet", aggregateId: setId, data: { result: input.result } });
    return ok(cycle);
  }

  /** Use a set on a patient — only if sterile. Links the usage to the cycle that
   *  sterilised it (traceability), and marks the set used. */
  async useSet(actorId: string, setId: InstrumentSetId, encounterId: string, usedAt: string): Promise<Result<SetUsage, AppError>> {
    const set = await this.store.getSet(setId);
    if (set === undefined) return err(notFound("instrument set not found", "perioperative.cssd.set_not_found"));
    const usable = assertSetUsable(set.status);
    if (!usable.ok) return err(usable.error);
    const cycles = await this.store.cyclesForSet(setId);
    const lastCycle = cycles[cycles.length - 1]!; // status sterile ⇒ a passing cycle exists
    const usage: SetUsage = { id: newId<"SetUsage">(), setId, encounterId, sterilisationCycleId: lastCycle.id, usedAt, usedBy: actorId };
    await this.store.saveUsage(usage);
    await this.store.saveSet({ ...set, status: "used" });
    await this.audit.record({ actorId, entityType: "SetUsage", entityId: usage.id, action: "CREATE", after: { setId, encounterId } });
    await this.events.emit({ type: "InstrumentSetUsed", aggregateType: "SurgicalEncounter", aggregateId: encounterId, data: { setId } });
    return ok(usage);
  }

  async setHistory(setId: InstrumentSetId): Promise<Result<SetHistory, AppError>> {
    const set = await this.store.getSet(setId);
    if (set === undefined) return err(notFound("instrument set not found", "perioperative.cssd.set_not_found"));
    const [cycles, usages] = await Promise.all([this.store.cyclesForSet(setId), this.store.usagesForSet(setId)]);
    return ok({ set, cycles, usages });
  }

  setsUsedForEncounter(encounterId: string): Promise<readonly SetUsage[]> {
    return this.store.usagesForEncounter(encounterId);
  }
}
