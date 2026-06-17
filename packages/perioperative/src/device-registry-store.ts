import type { ConsumableUse } from "./types.js";

/** Query surface over captured consumable/implant lines, for registry reporting. */
export interface ImplantUsageStore {
  byPatient(patientId: string): Promise<readonly ConsumableUse[]>;
  /** All uses of a device code, optionally narrowed to a lot/serial (recall). */
  byCodeLot(code: string, lotNo?: string): Promise<readonly ConsumableUse[]>;
  /** Uses recorded within [since, until] (inclusive), for periodic registry export. */
  inWindow(since: string, until: string): Promise<readonly ConsumableUse[]>;
}

export class InMemoryImplantUsageStore implements ImplantUsageStore {
  constructor(private readonly uses: readonly ConsumableUse[] = []) {}
  async byPatient(patientId: string): Promise<readonly ConsumableUse[]> {
    return this.uses.filter((u) => u.patientId === patientId);
  }
  async byCodeLot(code: string, lotNo?: string): Promise<readonly ConsumableUse[]> {
    return this.uses.filter((u) => u.code === code && (lotNo === undefined || u.lotNo === lotNo));
  }
  async inWindow(since: string, until: string): Promise<readonly ConsumableUse[]> {
    return this.uses.filter((u) => u.recordedAt >= since && u.recordedAt <= until);
  }
}
