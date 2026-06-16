import { describe, expect, it } from "vitest";
import { InMemoryAdvancedTestSpecStore, SEED_ADVANCED_TEST_SPECS, interpret } from "./advanced-tests.js";
import type { AdvancedTestSpec } from "./types.js";

const dfi: AdvancedTestSpec = { code: "dfi", name: { ar: "د", en: "DFI" }, unit: "%", direction: "higher_worse", normalThreshold: 15, borderlineThreshold: 30, active: true };
const hba: AdvancedTestSpec = { code: "hba", name: { ar: "ه", en: "HBA" }, unit: "%", direction: "higher_better", normalThreshold: 80, borderlineThreshold: 65, active: true };

describe("advanced sperm test interpretation", () => {
  it("higher-is-worse (DFI): normal ≤15, borderline ≤30, abnormal >30 (inclusive bounds)", () => {
    expect(interpret(dfi, 15)).toBe("normal");
    expect(interpret(dfi, 15.1)).toBe("borderline");
    expect(interpret(dfi, 30)).toBe("borderline");
    expect(interpret(dfi, 30.1)).toBe("abnormal");
  });
  it("higher-is-better (HBA): normal ≥80, borderline ≥65, abnormal <65", () => {
    expect(interpret(hba, 80)).toBe("normal");
    expect(interpret(hba, 79.9)).toBe("borderline");
    expect(interpret(hba, 65)).toBe("borderline");
    expect(interpret(hba, 64.9)).toBe("abnormal");
  });
});

describe("advanced test spec store (config)", () => {
  it("looks up a seeded spec, returns null for unknown, lists only active", async () => {
    const store = new InMemoryAdvancedTestSpecStore();
    expect((await store.get("dfi"))?.direction).toBe("higher_worse");
    expect(await store.get("nope")).toBeNull();
    expect((await store.listActive()).length).toBe(SEED_ADVANCED_TEST_SPECS.length);

    const custom = new InMemoryAdvancedTestSpecStore([dfi, { ...hba, active: false }]);
    expect((await custom.listActive()).map((s) => s.code)).toEqual(["dfi"]);
  });

  it("seed set is bilingual and includes DNA fragmentation", () => {
    expect(SEED_ADVANCED_TEST_SPECS.every((s) => s.name.ar.length > 0 && s.name.en.length > 0)).toBe(true);
    expect(SEED_ADVANCED_TEST_SPECS.some((s) => s.code === "dfi")).toBe(true);
  });
});
