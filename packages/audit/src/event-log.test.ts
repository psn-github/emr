import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { DomainEventLog } from "./event-log.js";
import { InMemoryChainStore } from "./store.js";
import type { DomainEventPayload } from "./types.js";

describe("DomainEventLog", () => {
  it("emits hash-chained events and verifies intact", async () => {
    const log = new DomainEventLog(
      new InMemoryChainStore<DomainEventPayload>(),
      fixedClock(new Date("2026-06-12T08:00:00.000Z")),
    );
    await log.emit({ type: "PersonRegistered", aggregateType: "Person", aggregateId: "p1", data: { n: 1 } });
    await log.emit({ type: "CoupleCreated", aggregateType: "Couple", aggregateId: "c1", data: { p: "p1" } });

    const events = await log.events();
    expect(events.map((e) => e.payload.type)).toEqual(["PersonRegistered", "CoupleCreated"]);
    expect(events[1]!.prevHash).toBe(events[0]!.hash);
    expect((await log.verifyIntegrity()).ok).toBe(true);
  });
});
