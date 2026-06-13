import type { LocationMovement, PatientLocation } from "./flow-types.js";

export interface FlowStore {
  /** Upsert a patient's current location (keyed by patientId). */
  saveLocation(loc: PatientLocation): Promise<void>;
  getLocation(patientId: string): Promise<PatientLocation | null>;
  listCurrent(): Promise<readonly PatientLocation[]>;
  /** Append an audited movement (history; never overwritten). */
  saveMovement(m: LocationMovement): Promise<void>;
  listMovements(patientId: string): Promise<readonly LocationMovement[]>;
}

export class InMemoryFlowStore implements FlowStore {
  private readonly current = new Map<string, PatientLocation>();
  private readonly movements: LocationMovement[] = [];

  async saveLocation(loc: PatientLocation): Promise<void> {
    this.current.set(loc.patientId, loc);
  }
  async getLocation(patientId: string): Promise<PatientLocation | null> {
    return this.current.get(patientId) ?? null;
  }
  async listCurrent(): Promise<readonly PatientLocation[]> {
    return [...this.current.values()];
  }
  async saveMovement(m: LocationMovement): Promise<void> {
    this.movements.push(m);
  }
  async listMovements(patientId: string): Promise<readonly LocationMovement[]> {
    return this.movements.filter((m) => m.patientId === patientId);
  }
}
