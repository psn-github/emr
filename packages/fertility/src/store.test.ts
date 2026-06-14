import { describe, expect, it } from "vitest";
import { asId } from "@oxford/core";
import { InMemoryCycleStore } from "./store.js";
import type { Cycle } from "./types.js";

const cycle = (id: string, owner: Cycle["owner"], over: Partial<Cycle> = {}): Cycle => ({
  id: asId<"Cycle">(id), type: "icsi", owner, protocolId: null, status: "planned",
  signedConsents: [], cancellationReasonCode: null, cancellationCategory: null, cancellationNote: null,
  convertedFromId: null, createdAt: "2026-06-13T08:00:00.000Z", ...over,
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

  it("aggregates disposition counts (cancellations by category, conversions excluded)", async () => {
    const store = new InMemoryCycleStore();
    const couple: Cycle["owner"] = { kind: "couple", coupleId: "couple-1" };
    await store.save(cycle("c1", couple)); // active
    await store.save(cycle("c2", couple, { status: "cancelled", cancellationCategory: "poor_response" }));
    await store.save(cycle("c3", couple, { status: "cancelled", cancellationCategory: "poor_response" }));
    await store.save(cycle("c4", couple, { status: "cancelled", cancellationCategory: "patient_choice" }));
    await store.save(cycle("c5", couple, { status: "cancelled", cancellationCategory: "converted" })); // conversion source — excluded
    await store.save(cycle("c6", couple, { convertedFromId: asId<"Cycle">("c5") })); // the converted-to cycle
    await store.save(cycle("c7", couple, { status: "cancelled", cancellationCategory: null })); // legacy/uncoded

    const d = await store.dispositionCounts();
    expect(d.started).toBe(7);
    expect(d.cancelled).toBe(4); // c2, c3, c4, c7 (not c5)
    expect(d.converted).toBe(1); // c6
    expect(d.cancelledByCategory).toEqual({ poor_response: 2, patient_choice: 1, uncoded: 1 });
  });
});
