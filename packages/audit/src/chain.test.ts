import { describe, expect, it } from "vitest";
import type { ChainRecord } from "./chain.js";
import { linkRecord, verifyChain } from "./chain.js";
import { GENESIS_HASH } from "./hash.js";

function buildChain(payloads: number[]): ChainRecord<number>[] {
  const records: ChainRecord<number>[] = [];
  let head: ChainRecord<number> | null = null;
  let t = 0;
  for (const p of payloads) {
    const rec: ChainRecord<number> = linkRecord<number>(head, `2026-06-12T00:00:0${t}.000Z`, p);
    records.push(rec);
    head = rec;
    t += 1;
  }
  return records;
}

describe("linkRecord", () => {
  it("links the first record to genesis", () => {
    const rec = linkRecord(null, "2026-06-12T00:00:00.000Z", 1);
    expect(rec.seq).toBe(1);
    expect(rec.prevHash).toBe(GENESIS_HASH);
  });

  it("links subsequent records to the head's hash", () => {
    const first = linkRecord(null, "2026-06-12T00:00:00.000Z", 1);
    const second = linkRecord(first, "2026-06-12T00:00:01.000Z", 2);
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
  });
});

describe("verifyChain", () => {
  it("accepts an empty chain", () => {
    expect(verifyChain([]).ok).toBe(true);
  });

  it("accepts an intact chain", () => {
    expect(verifyChain(buildChain([10, 20, 30])).ok).toBe(true);
  });

  it("detects a tampered payload (hash-mismatch)", () => {
    const chain = buildChain([10, 20, 30]);
    const tampered = chain.map((r) => (r.seq === 2 ? { ...r, payload: 999 } : r));
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ seq: 2, reason: "hash-mismatch" });
  });

  it("detects a broken prev-hash link", () => {
    const chain = buildChain([10, 20, 30]);
    const tampered = chain.map((r) => (r.seq === 3 ? { ...r, prevHash: GENESIS_HASH } : r));
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("prev-hash-mismatch");
  });

  it("detects a removed/reordered record (seq-out-of-order)", () => {
    const chain = buildChain([10, 20, 30]);
    const withGap = [chain[0]!, chain[2]!]; // drop seq 2
    const result = verifyChain(withGap);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ seq: 3, reason: "seq-out-of-order" });
  });
});
