import { describe, expect, it } from "vitest";
import { InMemoryChainStore } from "./store.js";
import { linkRecord } from "./chain.js";

describe("InMemoryChainStore", () => {
  it("starts empty", async () => {
    const store = new InMemoryChainStore<number>();
    expect(await store.head()).toBeNull();
    expect(await store.all()).toEqual([]);
  });

  it("appends and reports the head", async () => {
    const store = new InMemoryChainStore<number>();
    const first = linkRecord(null, "2026-06-12T00:00:00.000Z", 1);
    await store.append(first);
    expect(await store.head()).toEqual({ seq: 1, hash: first.hash });

    const second = linkRecord(first, "2026-06-12T00:00:01.000Z", 2);
    await store.append(second);
    expect((await store.all()).map((r) => r.payload)).toEqual([1, 2]);
  });

  it("returns a copy from all() (caller cannot mutate the store)", async () => {
    const store = new InMemoryChainStore<number>();
    await store.append(linkRecord(null, "2026-06-12T00:00:00.000Z", 1));
    const snapshot = await store.all();
    (snapshot as unknown[]).push("x");
    expect(await store.all()).toHaveLength(1);
  });

  it("rejects an append that does not extend the chain", async () => {
    const store = new InMemoryChainStore<number>();
    const first = linkRecord(null, "2026-06-12T00:00:00.000Z", 1);
    const skip = linkRecord({ seq: 5, hash: first.hash }, "2026-06-12T00:00:01.000Z", 2);
    await expect(store.append(skip)).rejects.toThrow(/expected seq 1/);
  });
});
