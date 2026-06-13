import { describe, expect, it } from "vitest";
import { cycleTimeline, CYCLE_STAGE_ORDER } from "./timeline.js";

describe("cycleTimeline (pure)", () => {
  it("marks done/current/upcoming around the current stage and points to the next", () => {
    const t = cycleTimeline("retrieval");
    expect(t.current).toBe("retrieval");
    expect(t.next).toBe("fertilisation");
    expect(t.cancelled).toBe(false);
    const byStatus = Object.fromEntries(t.steps.map((s) => [s.status, s.state]));
    expect(byStatus.planned).toBe("done");
    expect(byStatus.retrieval).toBe("current");
    expect(byStatus.transfer).toBe("upcoming");
    expect(t.steps).toHaveLength(CYCLE_STAGE_ORDER.length);
  });

  it("has no next at the final stage", () => {
    const t = cycleTimeline("outcome");
    expect(t.next).toBeNull();
    expect(t.steps.at(-1)).toEqual({ status: "outcome", state: "current" });
  });

  it("treats a cancelled cycle as out-of-band (no current, no next)", () => {
    const t = cycleTimeline("cancelled");
    expect(t.cancelled).toBe(true);
    expect(t.next).toBeNull();
    expect(t.steps.every((s) => s.state === "upcoming")).toBe(true);
  });

  it("starts at planned (nothing done yet)", () => {
    const t = cycleTimeline("planned");
    expect(t.next).toBe("stimulating");
    expect(t.steps.every((s) => s.state !== "done")).toBe(true);
  });
});
