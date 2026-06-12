import { describe, expect, it } from "vitest";
import { GENESIS_HASH, computeLinkHash } from "./hash.js";

describe("hash", () => {
  it("GENESIS_HASH is 64 hex zeros", () => {
    expect(GENESIS_HASH).toBe("0".repeat(64));
    expect(GENESIS_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computeLinkHash is a 64-char hex digest", () => {
    const h = computeLinkHash(GENESIS_HASH, 1, "2026-06-12T00:00:00.000Z", { a: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and independent of payload key order", () => {
    const a = computeLinkHash(GENESIS_HASH, 1, "2026-06-12T00:00:00.000Z", { a: 1, b: 2 });
    const b = computeLinkHash(GENESIS_HASH, 1, "2026-06-12T00:00:00.000Z", { b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("changes if prevHash, seq, occurredAt, or payload changes", () => {
    const base = computeLinkHash("ab", 1, "2026-06-12T00:00:00.000Z", { a: 1 });
    expect(computeLinkHash("cd", 1, "2026-06-12T00:00:00.000Z", { a: 1 })).not.toBe(base);
    expect(computeLinkHash("ab", 2, "2026-06-12T00:00:00.000Z", { a: 1 })).not.toBe(base);
    expect(computeLinkHash("ab", 1, "2026-06-12T00:00:01.000Z", { a: 1 })).not.toBe(base);
    expect(computeLinkHash("ab", 1, "2026-06-12T00:00:00.000Z", { a: 2 })).not.toBe(base);
  });
});
