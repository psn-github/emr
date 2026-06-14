import type { Cycle, CycleId, CycleStatus } from "./types.js";

/** Filter for the clinician cohort view (e.g. "all patients stimulating this week"). */
export interface CohortFilter {
  readonly status?: CycleStatus;
  readonly createdAfter?: string; // ISO, inclusive
  readonly createdBefore?: string; // ISO, inclusive
}

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
  /** Bulk cohort view: cycles matching status / creation window, oldest first. */
  cohort(filter: CohortFilter): Promise<readonly Cycle[]>;
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
  async cohort(filter: CohortFilter): Promise<readonly Cycle[]> {
    return [...this.cycles.values()]
      .filter((c) =>
        (filter.status === undefined || c.status === filter.status) &&
        (filter.createdAfter === undefined || c.createdAt >= filter.createdAfter) &&
        (filter.createdBefore === undefined || c.createdAt <= filter.createdBefore),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
