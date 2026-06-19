import { describe, expect, it } from "vitest";
import { screenDrugs } from "./allergy.js";

// Pure prescribe-time allergy screen (docs/01 §E8, ADR-0060): match prescribed
// formulary drugs against a patient's allergic drug classes. Advisory only.

const rfsh = { formularyItemId: "rfsh", dose: 225, unit: "IU" as const }; // gonadotropin_fsh
const trigger = { formularyItemId: "hcg_trigger", dose: 250, unit: "mcg" as const }; // trigger

describe("screenDrugs", () => {
  it("returns no warnings when the patient has no allergies", () => {
    expect(screenDrugs([rfsh, trigger], [])).toEqual([]);
  });

  it("warns for a drug whose formulary class matches an allergic class", () => {
    expect(screenDrugs([rfsh, trigger], ["gonadotropin_fsh"])).toEqual([
      { formularyItemId: "rfsh", drugClass: "gonadotropin_fsh" },
    ]);
  });

  it("warns once per matching prescribed drug; ignores non-matching + unknown items", () => {
    const warnings = screenDrugs([rfsh, trigger, { formularyItemId: "homebrew", dose: 1, unit: "mg" }], ["gonadotropin_fsh", "trigger"]);
    expect(warnings.map((w) => w.formularyItemId)).toEqual(["rfsh", "hcg_trigger"]);
  });
});
