import { describe, expect, it } from "vitest";
import { isNormalFertilisation, yieldsEmbryo } from "./fertilisation.js";

describe("fertilisation interpretation", () => {
  it("only 2PN is normal fertilisation", () => {
    expect(isNormalFertilisation("2PN")).toBe(true);
    for (const pn of ["0PN", "1PN", "3PN"] as const) expect(isNormalFertilisation(pn)).toBe(false);
  });

  it("only 2PN yields a culture embryo", () => {
    expect(yieldsEmbryo("2PN")).toBe(true);
    expect(yieldsEmbryo("3PN")).toBe(false);
  });
});
