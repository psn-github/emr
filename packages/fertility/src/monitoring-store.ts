import type { MonitoringVisit, Procedure } from "./monitoring.js";

export interface MonitoringStore {
  saveVisit(v: MonitoringVisit): Promise<void>;
  visitsForCycle(cycleId: string): Promise<readonly MonitoringVisit[]>;
  saveProcedure(p: Procedure): Promise<void>;
  proceduresForCycle(cycleId: string): Promise<readonly Procedure[]>;
}

export class InMemoryMonitoringStore implements MonitoringStore {
  private readonly visits: MonitoringVisit[] = [];
  private readonly procedures: Procedure[] = [];

  async saveVisit(v: MonitoringVisit): Promise<void> {
    this.visits.push(v);
  }
  async visitsForCycle(cycleId: string): Promise<readonly MonitoringVisit[]> {
    return this.visits.filter((v) => v.cycleId === cycleId);
  }
  async saveProcedure(p: Procedure): Promise<void> {
    const idx = this.procedures.findIndex((x) => x.id === p.id);
    if (idx >= 0) this.procedures[idx] = p;
    else this.procedures.push(p);
  }
  async proceduresForCycle(cycleId: string): Promise<readonly Procedure[]> {
    return this.procedures.filter((p) => p.cycleId === cycleId);
  }
}
