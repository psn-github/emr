import type { Cycle, CycleId } from "./types.js";

export interface CycleStore {
  save(cycle: Cycle): Promise<void>;
  get(id: CycleId): Promise<Cycle | null>;
  listForOwner(ownerId: string): Promise<readonly Cycle[]>;
}

export class InMemoryCycleStore implements CycleStore {
  private readonly cycles = new Map<string, Cycle>();

  async save(cycle: Cycle): Promise<void> {
    this.cycles.set(cycle.id, cycle);
  }
  async get(id: CycleId): Promise<Cycle | null> {
    return this.cycles.get(id) ?? null;
  }
  async listForOwner(ownerId: string): Promise<readonly Cycle[]> {
    return [...this.cycles.values()].filter((c) =>
      c.owner.kind === "couple" ? c.owner.coupleId === ownerId : c.owner.personId === ownerId,
    );
  }
}
