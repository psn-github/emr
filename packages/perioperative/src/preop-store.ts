import type { PreOpAssessment } from "./types.js";

export interface PreOpStore {
  save(a: PreOpAssessment): Promise<void>;
  forEncounter(encounterId: string): Promise<PreOpAssessment | undefined>;
}

export class InMemoryPreOpStore implements PreOpStore {
  private readonly byEncounter = new Map<string, PreOpAssessment>();

  async save(a: PreOpAssessment): Promise<void> {
    this.byEncounter.set(a.encounterId, a);
  }
  async forEncounter(encounterId: string): Promise<PreOpAssessment | undefined> {
    return this.byEncounter.get(encounterId);
  }
}
