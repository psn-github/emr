import type { Id } from "@oxford/core";

// Perioperative journey (docs/01 §E7). A SurgicalEncounter ties the pathway
// together: admit L3 → L2 bed → L1 recovery (pre-op holding) → theatre → L1
// recovery (post-op) → L2 bed → discharge. Each transition is an audited bed/
// floor movement (driven through the facility/flow seam — ADR-0023).

export type SurgicalEncounterId = Id<"SurgicalEncounter">;

export type JourneyStage =
  | "admitted" // on L3
  | "ward_bed" // L2 inpatient bed (pre-op)
  | "pre_theatre" // L1 recovery/holding before theatre
  | "in_theatre" // L1 theatre
  | "recovery" // L1 recovery (post-op)
  | "post_op_ward" // L2 inpatient bed (post-op)
  | "discharged"
  | "cancelled";

export interface SurgicalEncounter {
  readonly id: SurgicalEncounterId;
  readonly patientId: string;
  readonly indication: string;
  readonly stage: JourneyStage;
  /** Logical link to a theatre case (scheduling) once booked. */
  readonly theatreCaseRef: string | null;
  readonly admittedAt: string;
  readonly cancellationReason: string | null;
}
