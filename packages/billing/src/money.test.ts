import { describe, expect, it } from "vitest";
import { assertAmount, balance, formatKwd, isValidAmount, lineTotal, subtotal } from "./money.js";

describe("money (integer fils, no float drift)", () => {
  it("validates amounts", () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(1500)).toBe(true);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(10.5)).toBe(false);
    expect(assertAmount(1500).ok).toBe(true);
    const bad = assertAmount(1.5);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("billing.bad_amount");
  });

  it("computes line totals, subtotal, balance (no tax — total = subtotal)", () => {
    expect(lineTotal(1500, 3)).toBe(4500);
    expect(subtotal([4500, 1000, 250])).toBe(5750);
    expect(balance(5750, 5000)).toBe(750);
  });

  it("formats KWD with 3 decimals", () => {
    expect(formatKwd(1500)).toBe("1.500 KWD");
    expect(formatKwd(5)).toBe("0.005 KWD");
    expect(formatKwd(0)).toBe("0.000 KWD");
    expect(formatKwd(-250)).toBe("-0.250 KWD");
  });
});
