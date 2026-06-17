import { describe, expect, it } from "vitest";
import { DemandPlanningService, type OnHandPort } from "./demand-planning-service.js";
import { InMemoryConsumptionProfileStore, type CycleConsumptionProfile } from "./demand-planning.js";

const profiles: readonly CycleConsumptionProfile[] = [
  { cycleType: "icsi", items: [{ itemId: "culture_media", quantityPerCycle: 2 }, { itemId: "icsi_dish", quantityPerCycle: 1 }] },
];

describe("DemandPlanningService", () => {
  it("forecasts shortfall from booked cycles, querying on-hand only for needed items", async () => {
    const queried: string[] = [];
    const stock: OnHandPort = {
      async onHand(itemId) {
        queried.push(itemId);
        return itemId === "culture_media" ? 5 : 0;
      },
    };
    const svc = new DemandPlanningService(new InMemoryConsumptionProfileStore(profiles), stock);

    const lines = await svc.forecast({ icsi: 4 });
    expect(lines).toEqual([
      { itemId: "culture_media", required: 8, onHand: 5, shortfall: 3 },
      { itemId: "icsi_dish", required: 4, onHand: 0, shortfall: 4 },
    ]);
    expect(queried.sort()).toEqual(["culture_media", "icsi_dish"]);

    // no booked cycles → no items queried, empty forecast
    const empty = await svc.forecast({});
    expect(empty).toEqual([]);
  });
});
