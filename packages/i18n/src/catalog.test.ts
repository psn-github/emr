import { describe, expect, it } from "vitest";
import { allKeys, assertCatalogComplete, findMissingKeys } from "./catalog.js";
import { coreMessages } from "./messages.js";
import type { Catalog } from "./types.js";

const incomplete: Catalog = {
  en: { a: "A", b: "B" },
  ar: { a: "أ" }, // missing "b"
};

describe("catalog parity", () => {
  it("computes the sorted union of keys", () => {
    expect(allKeys(incomplete)).toEqual(["a", "b"]);
  });

  it("finds keys missing per locale", () => {
    expect(findMissingKeys(incomplete)).toEqual({ en: [], ar: ["b"] });
  });

  it("throws on an incomplete catalog", () => {
    expect(() => assertCatalogComplete(incomplete)).toThrow(/incomplete translation catalog.*ar: b/);
  });

  it("accepts a complete catalog", () => {
    expect(() => assertCatalogComplete({ en: { a: "A" }, ar: { a: "أ" } })).not.toThrow();
  });

  it("the shipped core catalog is complete (zero untranslated strings)", () => {
    expect(() => assertCatalogComplete(coreMessages)).not.toThrow();
    expect(findMissingKeys(coreMessages)).toEqual({ en: [], ar: [] });
  });
});
