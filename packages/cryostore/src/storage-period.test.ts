import { describe, expect, it } from "vitest";
import { computeExpiry, isExpired, expiresWithin } from "./storage-period.js";
import type { StorageConsent } from "./types.js";
import { asId } from "@oxford/core";

const consent = (expiresAt: string): StorageConsent => ({
  id: asId<"StorageConsent">("c-1"),
  specimenId: asId<"CryoSpecimen">("s-1"),
  consentedAt: "2026-01-01T00:00:00.000Z",
  expiresAt,
  renewedAt: null,
});

describe("storage period", () => {
  it("computes expiry from consent date + configured years", () => {
    expect(computeExpiry("2026-01-01T00:00:00.000Z", 10)).toBe("2036-01-01T00:00:00.000Z");
  });

  it("treats the expiry instant as expired (inclusive)", () => {
    const c = consent("2030-01-01T00:00:00.000Z");
    expect(isExpired(c, new Date("2030-01-01T00:00:00.000Z"))).toBe(true);
    expect(isExpired(c, new Date("2029-12-31T23:59:59.000Z"))).toBe(false);
  });

  it("flags consents due within the alert window but not yet expired", () => {
    const c = consent("2030-01-10T00:00:00.000Z");
    expect(expiresWithin(c, new Date("2030-01-01T00:00:00.000Z"), 30)).toBe(true);
    expect(expiresWithin(c, new Date("2029-01-01T00:00:00.000Z"), 30)).toBe(false); // too far out
    expect(expiresWithin(c, new Date("2030-01-11T00:00:00.000Z"), 30)).toBe(false); // already expired
  });
});
