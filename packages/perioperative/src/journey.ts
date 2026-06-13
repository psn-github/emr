import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { JourneyStage } from "./types.js";

// Perioperative journey state machine (pure, 100%). The pathway is linear
// (admitted → ward_bed → pre_theatre → in_theatre → recovery → post_op_ward →
// discharged); any non-terminal stage may be cancelled. Each stage maps to a
// care-location placement the service drives through the facility/flow seam.

/** A placement kind the facility/flow seam resolves to a concrete node/bed. */
export type CareLocationKind = "l3_admit" | "ward_bed" | "recovery_bed" | "theatre";

export interface StagePlacement {
  readonly kind: CareLocationKind;
  /** PatientFlowStatus the flow board records for this stage. */
  readonly status: string;
}

const PLACEMENT: Record<JourneyStage, StagePlacement | null> = {
  admitted: { kind: "l3_admit", status: "admitted" },
  ward_bed: { kind: "ward_bed", status: "admitted" },
  pre_theatre: { kind: "recovery_bed", status: "pre_op_holding" },
  in_theatre: { kind: "theatre", status: "in_theatre" },
  recovery: { kind: "recovery_bed", status: "in_recovery" },
  post_op_ward: { kind: "ward_bed", status: "post_op" },
  discharged: null, // releases the bed (handled via the seam's discharge)
  cancelled: null,
};

/** The placement for a stage, or null for stages that release rather than place. */
export function stagePlacement(stage: JourneyStage): StagePlacement | null {
  return PLACEMENT[stage];
}

const ALLOWED: Record<JourneyStage, readonly JourneyStage[]> = {
  admitted: ["ward_bed", "cancelled"],
  ward_bed: ["pre_theatre", "cancelled"],
  pre_theatre: ["in_theatre", "cancelled"],
  in_theatre: ["recovery", "cancelled"],
  recovery: ["post_op_ward", "cancelled"],
  post_op_ward: ["discharged", "cancelled"],
  discharged: [],
  cancelled: [],
};

export function canAdvance(from: JourneyStage, to: JourneyStage): boolean {
  return ALLOWED[from].includes(to);
}

export function assertAdvance(from: JourneyStage, to: JourneyStage): Result<void, ReturnType<typeof validationError>> {
  if (!canAdvance(from, to)) {
    return err(validationError(`illegal perioperative transition ${from} → ${to}`, "perioperative.bad_transition"));
  }
  return ok(undefined);
}
