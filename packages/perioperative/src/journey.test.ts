import { describe, expect, it } from "vitest";
import { canAdvance, assertAdvance, stagePlacement } from "./journey.js";
import type { JourneyStage } from "./types.js";

describe("perioperative journey transitions", () => {
  it("permits the linear pathway and cancellation from non-terminal stages", () => {
    const linear: [JourneyStage, JourneyStage][] = [
      ["admitted", "ward_bed"],
      ["ward_bed", "pre_theatre"],
      ["pre_theatre", "in_theatre"],
      ["in_theatre", "recovery"],
      ["recovery", "post_op_ward"],
      ["post_op_ward", "discharged"],
    ];
    for (const [from, to] of linear) expect(canAdvance(from, to)).toBe(true);
    for (const s of ["admitted", "ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward"] as const) {
      expect(canAdvance(s, "cancelled")).toBe(true);
    }
  });

  it("rejects skipping stages and any move out of a terminal stage", () => {
    expect(canAdvance("admitted", "in_theatre")).toBe(false);
    expect(canAdvance("discharged", "ward_bed")).toBe(false);
    expect(canAdvance("cancelled", "ward_bed")).toBe(false);
    const r = assertAdvance("admitted", "discharged");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("perioperative.bad_transition");
    expect(assertAdvance("admitted", "ward_bed").ok).toBe(true);
  });

  it("maps each stage to its care-location placement (release stages are null)", () => {
    expect(stagePlacement("admitted")).toEqual({ kind: "l3_admit", status: "admitted" });
    expect(stagePlacement("ward_bed")).toEqual({ kind: "ward_bed", status: "admitted" });
    expect(stagePlacement("pre_theatre")).toEqual({ kind: "recovery_bed", status: "pre_op_holding" });
    expect(stagePlacement("in_theatre")).toEqual({ kind: "theatre", status: "in_theatre" });
    expect(stagePlacement("recovery")).toEqual({ kind: "recovery_bed", status: "in_recovery" });
    expect(stagePlacement("post_op_ward")).toEqual({ kind: "ward_bed", status: "post_op" });
    expect(stagePlacement("discharged")).toBeNull();
    expect(stagePlacement("cancelled")).toBeNull();
  });
});
