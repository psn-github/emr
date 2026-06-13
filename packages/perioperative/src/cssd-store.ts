import type { InstrumentSet, InstrumentSetId, SterilisationCycle, SetUsage } from "./types.js";

export interface CssdStore {
  saveSet(s: InstrumentSet): Promise<void>;
  getSet(id: InstrumentSetId): Promise<InstrumentSet | undefined>;
  saveCycle(c: SterilisationCycle): Promise<void>;
  cyclesForSet(setId: InstrumentSetId): Promise<readonly SterilisationCycle[]>;
  saveUsage(u: SetUsage): Promise<void>;
  usagesForSet(setId: InstrumentSetId): Promise<readonly SetUsage[]>;
  usagesForEncounter(encounterId: string): Promise<readonly SetUsage[]>;
}

export class InMemoryCssdStore implements CssdStore {
  private readonly sets = new Map<string, InstrumentSet>();
  private readonly cycles: SterilisationCycle[] = [];
  private readonly usages: SetUsage[] = [];

  async saveSet(s: InstrumentSet): Promise<void> {
    this.sets.set(s.id, s);
  }
  async getSet(id: InstrumentSetId): Promise<InstrumentSet | undefined> {
    return this.sets.get(id);
  }
  async saveCycle(c: SterilisationCycle): Promise<void> {
    this.cycles.push(c);
  }
  async cyclesForSet(setId: InstrumentSetId): Promise<readonly SterilisationCycle[]> {
    return this.cycles.filter((c) => c.setId === setId);
  }
  async saveUsage(u: SetUsage): Promise<void> {
    this.usages.push(u);
  }
  async usagesForSet(setId: InstrumentSetId): Promise<readonly SetUsage[]> {
    return this.usages.filter((u) => u.setId === setId);
  }
  async usagesForEncounter(encounterId: string): Promise<readonly SetUsage[]> {
    return this.usages.filter((u) => u.encounterId === encounterId);
  }
}
