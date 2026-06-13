import type { OxfordHandlingEvent, WitnessReconciliation } from "./types.js";

export interface WitnessingStore {
  saveEvent(e: OxfordHandlingEvent): Promise<void>;
  eventsForCycle(cycleId: string): Promise<readonly OxfordHandlingEvent[]>;
  saveReconciliation(r: WitnessReconciliation): Promise<void>;
  reconciliationsForCycle(cycleId: string): Promise<readonly WitnessReconciliation[]>;
}

export class InMemoryWitnessingStore implements WitnessingStore {
  private readonly events: OxfordHandlingEvent[] = [];
  private readonly reconciliations: WitnessReconciliation[] = [];

  async saveEvent(e: OxfordHandlingEvent): Promise<void> {
    this.events.push(e);
  }
  async eventsForCycle(cycleId: string): Promise<readonly OxfordHandlingEvent[]> {
    return this.events.filter((e) => e.cycleId === cycleId);
  }
  async saveReconciliation(r: WitnessReconciliation): Promise<void> {
    this.reconciliations.push(r);
  }
  async reconciliationsForCycle(cycleId: string): Promise<readonly WitnessReconciliation[]> {
    return this.reconciliations.filter((r) => r.cycleId === cycleId);
  }
}
