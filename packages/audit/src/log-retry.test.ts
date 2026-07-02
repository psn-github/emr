import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { HashChainLog } from "./log.js";
import { ChainConflictError, InMemoryChainStore, type ChainStore } from "./store.js";
import type { ChainRecord } from "./chain.js";

// The retry contract (ADR-0061): concurrent appenders race on the store's
// advisory lock; the losers get a ChainConflictError and must re-read the head,
// re-link, and retry. HashChainLog implements that bounded retry. These are the
// deterministic unit proofs (a flaky fake store); concurrency.integration.test.ts
// proves it end-to-end against real Postgres.

const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));

/** Wraps an InMemory store and forces the first `conflicts` appends to fail with
 *  ChainConflictError (as a lost advisory-lock race would), then behaves normally. */
class FlakyStore<P> implements ChainStore<P> {
  private readonly inner = new InMemoryChainStore<P>();
  constructor(private conflicts: number) {}
  head() {
    return this.inner.head();
  }
  async append(record: ChainRecord<P>): Promise<void> {
    if (this.conflicts > 0) {
      this.conflicts -= 1;
      throw new ChainConflictError("concurrent append — retry");
    }
    return this.inner.append(record);
  }
  all() {
    return this.inner.all();
  }
}

/** Always rejects with a non-retryable error. */
class BrokenStore<P> implements ChainStore<P> {
  async head() {
    return null;
  }
  async append(): Promise<void> {
    throw new Error("disk on fire");
  }
  async all(): Promise<readonly ChainRecord<P>[]> {
    return [];
  }
}

describe("HashChainLog append retry", () => {
  it("retries past transient conflicts and lands the record with the right seq", async () => {
    const log = new HashChainLog(new FlakyStore<{ n: number }>(3), clock);
    const rec = await log.append({ n: 1 });
    expect(rec.seq).toBe(1);
    expect((await log.records())).toHaveLength(1);
  });

  it("gives up after maxAppendRetries and surfaces the conflict", async () => {
    const log = new HashChainLog(new FlakyStore<{ n: number }>(99), clock, 2);
    await expect(log.append({ n: 1 })).rejects.toBeInstanceOf(ChainConflictError);
  });

  it("does NOT retry a non-conflict error — it rethrows immediately", async () => {
    const log = new HashChainLog(new BrokenStore<{ n: number }>(), clock);
    await expect(log.append({ n: 1 })).rejects.toThrow("disk on fire");
  });

  it("ChainConflictError is a typed, catchable Error", () => {
    const e = new ChainConflictError("x");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ChainConflictError);
    expect(e.message).toBe("x");
  });
});
