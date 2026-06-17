import { describe, expect, it } from "vitest";
import { forecastDemand, InMemoryConsumptionProfileStore, SEED_CONSUMPTION_PROFILES, type CycleConsumptionProfile } from "./demand-planning.js";

const profiles: readonly CycleConsumptionProfile[] = [
  { cycleType: "icsi", items: [{ itemId: "culture_media", quantityPerCycle: 2 }, { itemId: "icsi_dish", quantityPerCycle: 1 }] },
  { cycleType: "fet", items: [{ itemId: "culture_media", quantityPerCycle: 1 }, { itemId: "et_catheter", quantityPerCycle: 1 }] },
];

describe("demand planning (pure)", () => {
  it("aggregates required quantities across cycle types and nets against on-hand", () => {
    // 5 ICSI + 3 FET: culture_media = 5*2 + 3*1 = 13; icsi_dish = 5; et_catheter = 3
    const lines = forecastDemand(profiles, { icsi: 5, fet: 3 }, { culture_media: 10, icsi_dish: 8 });
    expect(lines).toEqual([
      { itemId: "culture_media", required: 13, onHand: 10, shortfall: 3 },
      { itemId: "et_catheter", required: 3, onHand: 0, shortfall: 3 }, // no on-hand entry → 0
      { itemId: "icsi_dish", required: 5, onHand: 8, shortfall: 0 }, // fully covered
    ]);
  });

  it("ignores cycle types with no (or zero) booked cycles", () => {
    const lines = forecastDemand(profiles, { icsi: 0, ivf: 4 }, {});
    expect(lines).toEqual([]); // icsi has 0, ivf has no profile
  });

  it("profile store lists the seed profiles by default", async () => {
    expect(await new InMemoryConsumptionProfileStore().list()).toEqual(SEED_CONSUMPTION_PROFILES);
    expect((await new InMemoryConsumptionProfileStore(profiles).list()).map((p) => p.cycleType)).toEqual(["icsi", "fet"]);
  });
});
