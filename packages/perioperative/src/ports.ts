import type { Result, AppError } from "@oxford/core";
import type { CareLocationKind } from "./journey.js";

// Facility/flow seam (ADR-0023). The app wires this to @oxford/facility's
// FacilityService/FlowService. The perioperative module never touches the bed
// tables directly — it asks the seam to place a patient into a care location of a
// given kind (allocating a free bed where applicable) or to release them on
// discharge/cancel. Capacity is enforced HERE (a placement fails if no bed/
// theatre is free), so the journey is capacity-aware without cross-module access.

export interface FacilityFlowPort {
  /** Place the patient into a free location of `kind` with the given flow status.
   *  Returns the node used, or a capacity error if none is free. */
  place(actorId: string, patientId: string, kind: CareLocationKind, status: string): Promise<Result<{ locationNodeId: string }, AppError>>;
  /** Release the patient (free their bed) on discharge or cancellation. */
  release(actorId: string, patientId: string, reason: string): Promise<Result<void, AppError>>;
}
