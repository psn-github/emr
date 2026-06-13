import type { TheatreCase, TheatreCaseId } from "./types.js";

export interface TheatreCaseStore {
  save(c: TheatreCase): Promise<void>;
  get(id: TheatreCaseId): Promise<TheatreCase | undefined>;
  /** Scheduled (non-cancelled) cases listed for a given calendar day. */
  scheduledForDate(scheduledDate: string): Promise<readonly TheatreCase[]>;
}

export class InMemoryTheatreCaseStore implements TheatreCaseStore {
  private readonly cases = new Map<string, TheatreCase>();

  async save(c: TheatreCase): Promise<void> {
    this.cases.set(c.id, c);
  }
  async get(id: TheatreCaseId): Promise<TheatreCase | undefined> {
    return this.cases.get(id);
  }
  async scheduledForDate(scheduledDate: string): Promise<readonly TheatreCase[]> {
    return [...this.cases.values()].filter((c) => c.scheduledDate === scheduledDate && c.status === "scheduled");
  }
}
