import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical.js";

describe("canonicalize", () => {
  it("is stable regardless of key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("sorts nested keys and preserves array order", () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: [3, 1, 2] })).toBe(
      '{"a":[3,1,2],"z":{"x":2,"y":1}}',
    );
  });

  it("serializes primitives and null", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize("hi")).toBe('"hi"');
    expect(canonicalize(7)).toBe("7");
  });

  it("serializes Date as ISO string", () => {
    expect(canonicalize(new Date("2026-06-12T00:00:00.000Z"))).toBe('"2026-06-12T00:00:00.000Z"');
  });

  it("omits undefined object properties like JSON.stringify", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("rejects non-representable values", () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/);
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalize(undefined)).toThrow(/undefined/);
    expect(() => canonicalize(() => 1)).toThrow(/function/);
    expect(() => canonicalize(10n)).toThrow(/bigint/);
  });
});
