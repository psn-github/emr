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

export type InstrumentSetId = Id<"InstrumentSet">;
export type SterilisationCycleId = Id<"SterilisationCycle">;
export type SetUsageId = Id<"SetUsage">;

export interface InstrumentSet {
  readonly id: InstrumentSetId;
  readonly name: string;
  readonly composition: readonly string[];
  readonly status: "dirty" | "sterile" | "used";
}

export interface SterilisationCycle {
  readonly id: SterilisationCycleId;
  readonly setId: InstrumentSetId;
  readonly cycleType: string;
  readonly loadRef: string;
  readonly result: "pass" | "fail";
  readonly completedAt: string;
  readonly operator: string;
}

/** Which set was used on which patient/encounter — the traceability link. */
export interface SetUsage {
  readonly id: SetUsageId;
  readonly setId: InstrumentSetId;
  readonly encounterId: string;
  readonly sterilisationCycleId: string;
  readonly usedAt: string;
  readonly usedBy: string;
}

export type ObservationId = Id<"Observation">;
export type FollowUpId = Id<"FollowUp">;

/** A recovery (L1) or post-op ward (L2) observation set. */
export interface Observation {
  readonly id: ObservationId;
  readonly encounterId: string;
  readonly phase: "recovery" | "post_op_ward";
  readonly aldreteScore: number | null;
  readonly systolicBp: number;
  readonly heartRate: number;
  readonly spo2: number;
  readonly notes: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

export interface FollowUp {
  readonly id: FollowUpId;
  readonly encounterId: string;
  readonly scheduledFor: string;
  readonly bookedBy: string;
  readonly bookedAt: string;
}

export type IntraOpRecordId = Id<"IntraOpRecord">;
export type ConsumableUseId = Id<"ConsumableUse">;
export type SpecimenRecordId = Id<"SpecimenRecord">;

export interface DrugAdministration {
  readonly formularyCode: string;
  readonly dose: number;
  readonly unit: string;
}

export interface IntraOpRecord {
  readonly id: IntraOpRecordId;
  readonly encounterId: string;
  readonly procedurePerformed: string;
  readonly findings: string;
  readonly anaestheticTechnique: string;
  readonly drugs: readonly DrugAdministration[];
  readonly staff: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly recordedBy: string;
}

export interface ConsumableUse {
  readonly id: ConsumableUseId;
  readonly encounterId: string;
  readonly code: string;
  readonly description: string;
  readonly lotNo: string;
  readonly quantity: number;
  readonly unitPriceFils: number;
  readonly invoiceRef: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

/** A specimen removed in theatre — captured with its source + lot for traceability. */
export interface SpecimenRecord {
  readonly id: SpecimenRecordId;
  readonly encounterId: string;
  readonly type: string;
  readonly site: string;
  readonly lotRef: string;
  readonly collectedAt: string;
  readonly recordedBy: string;
}

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
