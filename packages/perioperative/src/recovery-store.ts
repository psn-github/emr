import type { Observation, FollowUp } from "./types.js";

export interface RecoveryStore {
  saveObservation(o: Observation): Promise<void>;
  observationsForEncounter(encounterId: string): Promise<readonly Observation[]>;
  saveFollowUp(f: FollowUp): Promise<void>;
  followUpForEncounter(encounterId: string): Promise<FollowUp | undefined>;
}

export class InMemoryRecoveryStore implements RecoveryStore {
  private readonly observations: Observation[] = [];
  private readonly followUps = new Map<string, FollowUp>();

  async saveObservation(o: Observation): Promise<void> {
    this.observations.push(o);
  }
  async observationsForEncounter(encounterId: string): Promise<readonly Observation[]> {
    return this.observations.filter((o) => o.encounterId === encounterId);
  }
  async saveFollowUp(f: FollowUp): Promise<void> {
    this.followUps.set(f.encounterId, f);
  }
  async followUpForEncounter(encounterId: string): Promise<FollowUp | undefined> {
    return this.followUps.get(encounterId);
  }
}
