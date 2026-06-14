import type { Cycle, CycleId } from "./types.js";

/** Cycle disposition counts for the KPI read-model (cancellation/conversion rates).
 *  `cancelled` EXCLUDES conversions (those carry the reserved `converted` category);
 *  `converted` counts the new cycles created by a conversion. */
export interface DispositionCounts {
  readonly started: number;
  readonly cancelled: number;
  readonly converted: number;
  readonly cancelledByCategory: Readonly<Record<string, number>>;
}

export interface CycleStore {
  save(cycle: Cycle): Promise<void>;
  get(id: CycleId): Promise<Cycle | null>;
  listForOwner(ownerId: string): Promise<readonly Cycle[]>;
  /** Aggregate disposition counts across all cycles (own-module table only). */
  dispositionCounts(): Promise<DispositionCounts>;
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
  async dispositionCounts(): Promise<DispositionCounts> {
    const all = [...this.cycles.values()];
    const cancelledByCategory: Record<string, number> = {};
    let cancelled = 0;
    let converted = 0;
    for (const c of all) {
      if (c.convertedFromId !== null) converted++;
      if (c.status === "cancelled" && c.cancellationCategory !== "converted") {
        cancelled++;
        const cat = c.cancellationCategory ?? "uncoded";
        cancelledByCategory[cat] = (cancelledByCategory[cat] ?? 0) + 1;
      }
    }
    return { started: all.length, cancelled, converted, cancelledByCategory };
  }
}
