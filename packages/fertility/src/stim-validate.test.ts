import { describe, expect, it } from "vitest";
import { formularyItem } from "./formulary.js";
import { validateDrugDose } from "./stim-validate.js";

describe("formulary", () => {
  it("looks up known items and rejects unknown", () => {
    expect(formularyItem("hp_hmg")!.unit).toBe("IU");
    expect(formularyItem("not-a-drug")).toBeNull();
  });
});

describe("validateDrugDose (drugs from formulary only)", () => {
  it("accepts a valid formulary drug + positive dose + matching unit", () => {
    expect(validateDrugDose({ formularyItemId: "rfsh", dose: 225, unit: "IU" }).ok).toBe(true);
  });
  it("rejects a free-text / unknown drug", () => {
    const r = validateDrugDose({ formularyItemId: "homebrew", dose: 100, unit: "IU" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("fertility.stim.unknown_drug");
  });
  it("rejects a non-positive or non-finite dose", () => {
    expect(validateDrugDose({ formularyItemId: "rfsh", dose: 0, unit: "IU" }).ok).toBe(false);
    const r = validateDrugDose({ formularyItemId: "rfsh", dose: Number.NaN, unit: "IU" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("fertility.stim.bad_dose");
  });
  it("rejects a unit that doesn't match the formulary item", () => {
    const r = validateDrugDose({ formularyItemId: "rfsh", dose: 225, unit: "mg" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("fertility.stim.unit_mismatch");
  });
});
