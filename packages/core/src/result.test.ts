import { describe, expect, it } from "vitest";
import { ok, err, isOk, isErr, map, mapErr, andThen, unwrap, unwrapOr } from "./result.js";

describe("Result", () => {
  it("constructs and narrows Ok", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("constructs and narrows Err", () => {
    const r = err("boom");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("boom");
  });

  it("map transforms Ok, passes Err through", () => {
    expect(unwrap(map(ok(2), (n) => n * 3))).toBe(6);
    const e = map(err<string>("bad"), (n: number) => n * 3);
    expect(isErr(e)).toBe(true);
  });

  it("mapErr transforms Err, passes Ok through", () => {
    expect(unwrap(mapErr(ok(1), () => "x"))).toBe(1);
    const e = mapErr(err("bad"), (s) => s.toUpperCase());
    expect(isErr(e) && e.error).toBe("BAD");
  });

  it("andThen chains Results", () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err("odd"));
    expect(unwrap(andThen(ok(8), half))).toBe(4);
    expect(isErr(andThen(ok(7), half))).toBe(true);
    expect(isErr(andThen(err<string>("pre"), half))).toBe(true);
  });

  it("unwrap throws on Err", () => {
    expect(() => unwrap(err({ code: "X" }))).toThrow(/unwrap on an Err/);
  });

  it("unwrapOr returns fallback on Err", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err("e"), 9)).toBe(9);
  });
});
