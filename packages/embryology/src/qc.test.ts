import { describe, expect, it } from "vitest";
import { InMemoryQcParameterStore, SEED_QC_PARAMETERS, evaluateReading } from "./qc.js";

describe("lab QC parameters (config) + evaluation", () => {
  it("passes a reading inside the range and fails one outside (both ends)", () => {
    const co2 = SEED_QC_PARAMETERS.find((p) => p.code === "incubator_co2")!;
    expect(evaluateReading(co2, 6.0)).toEqual({ inRange: true, status: "pass" });
    expect(evaluateReading(co2, co2.min)).toEqual({ inRange: true, status: "pass" }); // inclusive low
    expect(evaluateReading(co2, co2.max)).toEqual({ inRange: true, status: "pass" }); // inclusive high
    expect(evaluateReading(co2, co2.min - 0.1).status).toBe("fail");
    expect(evaluateReading(co2, co2.max + 0.1).status).toBe("fail");
  });

  it("looks up a seeded parameter and lists only active ones", async () => {
    const store = new InMemoryQcParameterStore();
    expect((await store.get("media_ph"))?.unit).toBe("pH");
    expect(await store.get("nope")).toBeNull();
    expect((await store.listActive()).length).toBe(SEED_QC_PARAMETERS.length);

    const custom = new InMemoryQcParameterStore([
      { code: "a", name: { ar: "أ", en: "A" }, unit: "%", min: 1, max: 2, active: true },
      { code: "b", name: { ar: "ب", en: "B" }, unit: "%", min: 1, max: 2, active: false },
    ]);
    expect((await custom.listActive()).map((p) => p.code)).toEqual(["a"]);
  });

  it("seed set is bilingual and covers incubator gas/temp + media pH/osmolality", () => {
    expect(SEED_QC_PARAMETERS.every((p) => p.name.ar.length > 0 && p.name.en.length > 0)).toBe(true);
    expect(SEED_QC_PARAMETERS.map((p) => p.code)).toEqual(
      expect.arrayContaining(["incubator_co2", "incubator_o2", "incubator_temp", "media_ph", "media_osmolality"]),
    );
  });
});
