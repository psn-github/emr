import { describe, expect, it } from "vitest";
import { buildMedicationSchedule, injectionTeachingFor } from "./medication.js";
import type { StimulationDay } from "./stimulation.js";

const day = (n: number, drugs: StimulationDay["drugs"]): StimulationDay => ({
  id: `d${n}` as StimulationDay["id"],
  cycleId: "c1",
  day: n,
  drugs,
  follicles: [],
  endometriumMm: null,
  endocrine: {},
  recordedBy: "doc",
  at: "2026-06-20T08:00:00Z",
});

describe("medication schedule + injection teaching (pure)", () => {
  it("maps a teaching video for a known drug, null for an unknown one", () => {
    expect(injectionTeachingFor("rfsh")).toBe("video:injection/rfsh");
    expect(injectionTeachingFor("mystery")).toBeNull();
    expect(injectionTeachingFor("rfsh", { rfsh: "video:custom" })).toBe("video:custom");
  });

  it("builds the schedule with formulary names + teaching refs; unknown drug → name null", () => {
    const sched = buildMedicationSchedule([
      day(1, [{ formularyItemId: "rfsh", dose: 225, unit: "IU", route: "SC" }]),
      day(2, [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }, { formularyItemId: "ghost", dose: 1, unit: "mg" }]),
    ]);
    expect(sched).toHaveLength(2);
    const d1 = sched[0]!.drugs[0]!;
    expect(d1.name?.en).toBe("Recombinant FSH");
    expect(d1.dose).toBe(225);
    expect(d1.route).toBe("SC");
    expect(d1.teachingVideoRef).toBe("video:injection/rfsh");
    // day 2: a missing route → null; an unknown formulary id → name null, no video
    expect(sched[1]!.drugs[0]!.route).toBeNull();
    expect(sched[1]!.drugs[1]!.name).toBeNull();
    expect(sched[1]!.drugs[1]!.teachingVideoRef).toBeNull();
  });
});
