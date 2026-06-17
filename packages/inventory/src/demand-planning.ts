// Demand planning from the cycle pipeline (docs/01 §E9 P2): forecast media /
// consumable burn from booked cycles. A per-cycle-type consumption profile (a
// bill-of-materials) is CONFIGURATION; multiplying it by booked cycle counts and
// netting against on-hand stock yields the expected shortfall to procure. Pure +
// 100% covered; the on-hand figures are supplied by the caller (inventory).

export interface CycleConsumptionItem {
  readonly itemId: string;
  readonly quantityPerCycle: number;
}
export interface CycleConsumptionProfile {
  readonly cycleType: string;
  readonly items: readonly CycleConsumptionItem[];
}

/** Default per-cycle consumption profiles (config; clinic maps codes to catalogue items). */
export const SEED_CONSUMPTION_PROFILES: readonly CycleConsumptionProfile[] = [
  { cycleType: "icsi", items: [{ itemId: "culture_media", quantityPerCycle: 2 }, { itemId: "icsi_dish", quantityPerCycle: 1 }, { itemId: "et_catheter", quantityPerCycle: 1 }] },
  { cycleType: "ivf", items: [{ itemId: "culture_media", quantityPerCycle: 2 }, { itemId: "ivf_dish", quantityPerCycle: 1 }, { itemId: "et_catheter", quantityPerCycle: 1 }] },
  { cycleType: "fet", items: [{ itemId: "culture_media", quantityPerCycle: 1 }, { itemId: "et_catheter", quantityPerCycle: 1 }] },
];

export interface DemandLine {
  readonly itemId: string;
  readonly required: number;
  readonly onHand: number;
  /** required − onHand, floored at 0 — the quantity to procure. */
  readonly shortfall: number;
}

/** Forecast item demand from booked cycle counts by type, netted against on-hand
 *  stock. Returns one line per required item, sorted by itemId. */
export function forecastDemand(
  profiles: readonly CycleConsumptionProfile[],
  countsByType: Readonly<Record<string, number>>,
  onHandByItem: Readonly<Record<string, number>>,
): readonly DemandLine[] {
  const required = new Map<string, number>();
  for (const profile of profiles) {
    const count = countsByType[profile.cycleType] ?? 0;
    if (count <= 0) continue;
    for (const item of profile.items) {
      required.set(item.itemId, (required.get(item.itemId) ?? 0) + count * item.quantityPerCycle);
    }
  }
  return [...required.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemId, req]) => {
      const onHand = onHandByItem[itemId] ?? 0;
      return { itemId, required: req, onHand, shortfall: Math.max(0, req - onHand) };
    });
}

/** Lookup surface for cycle consumption profiles (own-module config). */
export interface ConsumptionProfileStore {
  list(): Promise<readonly CycleConsumptionProfile[]>;
}

/** In-memory profile store seeded from a set (defaults to the seed profiles). */
export class InMemoryConsumptionProfileStore implements ConsumptionProfileStore {
  constructor(private readonly profiles: readonly CycleConsumptionProfile[] = SEED_CONSUMPTION_PROFILES) {}
  async list(): Promise<readonly CycleConsumptionProfile[]> {
    return this.profiles;
  }
}
