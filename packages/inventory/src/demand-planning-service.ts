import { forecastDemand, type ConsumptionProfileStore, type DemandLine } from "./demand-planning.js";

/** On-hand seam — supplied by InventoryService (no cross-module access). */
export interface OnHandPort {
  onHand(itemId: string): Promise<number>;
}

/**
 * Demand planning (docs/01 §E9 P2). Forecasts media/consumable burn from booked
 * cycle counts using the configured per-cycle consumption profiles, netted against
 * current on-hand stock to surface the shortfall to procure. Read-only planning.
 */
export class DemandPlanningService {
  constructor(
    private readonly profiles: ConsumptionProfileStore,
    private readonly stock: OnHandPort,
  ) {}

  /** Demand lines (required / on-hand / shortfall) from booked cycle counts by type. */
  async forecast(countsByType: Readonly<Record<string, number>>): Promise<readonly DemandLine[]> {
    const profiles = await this.profiles.list();
    // distinct items across the profiles that actually have booked cycles
    const itemIds = new Set<string>();
    for (const p of profiles) {
      if ((countsByType[p.cycleType] ?? 0) > 0) for (const i of p.items) itemIds.add(i.itemId);
    }
    const onHandByItem: Record<string, number> = {};
    for (const itemId of itemIds) onHandByItem[itemId] = await this.stock.onHand(itemId);
    return forecastDemand(profiles, countsByType, onHandByItem);
  }
}
