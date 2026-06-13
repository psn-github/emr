import type { IntraOpRecord, ConsumableUse, SpecimenRecord } from "./types.js";

export interface IntraOpStore {
  saveRecord(r: IntraOpRecord): Promise<void>;
  recordForEncounter(encounterId: string): Promise<IntraOpRecord | undefined>;
  saveConsumable(c: ConsumableUse): Promise<void>;
  consumablesForEncounter(encounterId: string): Promise<readonly ConsumableUse[]>;
  saveSpecimen(s: SpecimenRecord): Promise<void>;
  specimensForEncounter(encounterId: string): Promise<readonly SpecimenRecord[]>;
}

export class InMemoryIntraOpStore implements IntraOpStore {
  private readonly records = new Map<string, IntraOpRecord>();
  private readonly consumables: ConsumableUse[] = [];
  private readonly specimens: SpecimenRecord[] = [];

  async saveRecord(r: IntraOpRecord): Promise<void> {
    this.records.set(r.encounterId, r);
  }
  async recordForEncounter(encounterId: string): Promise<IntraOpRecord | undefined> {
    return this.records.get(encounterId);
  }
  async saveConsumable(c: ConsumableUse): Promise<void> {
    this.consumables.push(c);
  }
  async consumablesForEncounter(encounterId: string): Promise<readonly ConsumableUse[]> {
    return this.consumables.filter((c) => c.encounterId === encounterId);
  }
  async saveSpecimen(s: SpecimenRecord): Promise<void> {
    this.specimens.push(s);
  }
  async specimensForEncounter(encounterId: string): Promise<readonly SpecimenRecord[]> {
    return this.specimens.filter((s) => s.encounterId === encounterId);
  }
}
