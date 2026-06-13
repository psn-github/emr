import type { WhoChecklist } from "./who-checklist.js";

export interface WhoChecklistStore {
  save(checklist: WhoChecklist): Promise<void>;
  get(encounterId: string): Promise<WhoChecklist | undefined>;
}

export class InMemoryWhoChecklistStore implements WhoChecklistStore {
  private readonly byEncounter = new Map<string, WhoChecklist>();

  async save(checklist: WhoChecklist): Promise<void> {
    this.byEncounter.set(checklist.encounterId, checklist);
  }
  async get(encounterId: string): Promise<WhoChecklist | undefined> {
    return this.byEncounter.get(encounterId);
  }
}
