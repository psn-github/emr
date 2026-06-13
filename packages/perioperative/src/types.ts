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

export type PreOpAssessmentId = Id<"PreOpAssessment">;

/** ASA physical-status grade (I–VI → 1–6). Mallampati airway class 1–4. */
export interface PreOpAssessment {
  readonly id: PreOpAssessmentId;
  readonly encounterId: string;
  readonly anaestheticHistory: string;
  readonly mallampatiClass: number; // 1–4
  readonly asaGrade: number; // 1–6
  readonly investigations: readonly string[];
  readonly fastingConfirmed: boolean;
  /** Reference to the captured surgical/anaesthetic consent (required). */
  readonly consentRef: string;
  readonly assessedBy: string;
  readonly assessedAt: string;
}

export type TheatreCaseId = Id<"TheatreCase">;
export type TheatreCaseStatus = "scheduled" | "cancelled";

/** A booked theatre case. The theatre + staff are booked on the SHARED resource
 *  calendar via the scheduling seam (conflict-aware); each case provisionally
 *  reserves an L2 bed for its day. */
export interface TheatreCase {
  readonly id: TheatreCaseId;
  readonly patientId: string;
  readonly encounterId: string | null;
  readonly procedure: string;
  readonly theatreResourceId: string;
  readonly surgeonResourceId: string;
  readonly supportResourceIds: readonly string[];
  readonly equipment: readonly string[];
  /** The calendar day (YYYY-MM-DD) the case is listed — drives bed reservation. */
  readonly scheduledDate: string;
  readonly start: string;
  readonly end: string;
  readonly status: TheatreCaseStatus;
  /** Logical link to the scheduling appointment that holds the resources. */
  readonly appointmentRef: string;
}

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
