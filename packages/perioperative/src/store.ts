import type { SurgicalEncounter, SurgicalEncounterId } from "./types.js";

export interface PerioperativeStore {
  save(encounter: SurgicalEncounter): Promise<void>;
  get(id: SurgicalEncounterId): Promise<SurgicalEncounter | undefined>;
  active(): Promise<readonly SurgicalEncounter[]>;
}

export class InMemoryPerioperativeStore implements PerioperativeStore {
  private readonly encounters = new Map<string, SurgicalEncounter>();

  async save(encounter: SurgicalEncounter): Promise<void> {
    this.encounters.set(encounter.id, encounter);
  }
  async get(id: SurgicalEncounterId): Promise<SurgicalEncounter | undefined> {
    return this.encounters.get(id);
  }
  async active(): Promise<readonly SurgicalEncounter[]> {
    return [...this.encounters.values()].filter((e) => e.stage !== "discharged" && e.stage !== "cancelled");
  }
}
