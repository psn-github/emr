import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { InMemoryCycleStore } from "./store.js";
import type { Cycle } from "./types.js";

const cycle = (id: string, owner: Cycle["owner"]): Cycle => ({
  id: asId<"Cycle">(id), type: "icsi", owner, protocolId: null, status: "planned",
  signedConsents: [], cancellationReason: null, createdAt: "2026-06-13T08:00:00.000Z",
});

describe("InMemoryCycleStore", () => {
  it("saves, gets, and lists by owner (couple or person)", async () => {
    const store = new InMemoryCycleStore();
    await store.save(cycle("c1", { kind: "couple", coupleId: "couple-1" }));
    await store.save(cycle("c2", { kind: "person", personId: "person-1" }));
    await store.save(cycle("c3", { kind: "couple", coupleId: "couple-1" }));

    expect((await store.get(asId<"Cycle">("c1")))!.id).toBe("c1");
    expect(await store.get(asId<"Cycle">("nope"))).toBeNull();
    expect((await store.listForOwner("couple-1")).map((c) => c.id).sort()).toEqual(["c1", "c3"]);
    expect((await store.listForOwner("person-1")).map((c) => c.id)).toEqual(["c2"]);
  });
});
