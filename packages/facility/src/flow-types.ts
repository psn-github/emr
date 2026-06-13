import type { Id } from "@oxford/core";
import type { BedId, FloorLevel, LocationNodeId } from "./types.js";

// Live patient-flow & bed board (docs/01 §E1, docs/02 §3). A patient is always
// at a known location node with a status. Movements between nodes are audited
// events. The board carries LOCATION + STATUS ONLY — no clinical content — so
// reception/front-desk can see it (ADR-0013).

export type PatientFlowStatus =
  | "waiting"
  | "in_consult"
  | "in_scan"
  | "admitted"
  | "pre_op_holding"
  | "in_recovery"
  | "in_theatre"
  | "post_op"
  | "ready_for_discharge"
  | "discharged";

export type LocationMovementId = Id<"LocationMovement">;

/** A patient's current whereabouts. `patientId` is PHI; the rest is location. */
export interface PatientLocation {
  readonly patientId: string;
  readonly locationNodeId: LocationNodeId;
  readonly bedId: BedId | null;
  readonly status: PatientFlowStatus;
  readonly sinceAt: string;
}

/** An audited transfer between location nodes. */
export interface LocationMovement {
  readonly id: LocationMovementId;
  readonly patientId: string;
  readonly fromNodeId: LocationNodeId | null;
  readonly toNodeId: LocationNodeId;
  readonly bedId: BedId | null;
  readonly status: PatientFlowStatus;
  readonly movedBy: string;
  readonly occurredAt: string;
  readonly reason?: string;
}

// --- Board read model (location/status only) ---

export interface BoardPatient {
  readonly patientId: string;
  readonly status: PatientFlowStatus;
  readonly bedId: BedId | null;
}

export interface BoardLocation {
  readonly locationNodeId: LocationNodeId;
  readonly patients: readonly BoardPatient[];
}

export interface BedCapacity {
  readonly level: FloorLevel;
  readonly total: number;
  readonly free: number;
  readonly occupied: number;
}

export interface BoardBed {
  readonly bedId: BedId;
  readonly label: string;
  readonly status: string;
  readonly patientId: string | null;
}

export interface FlowBoard {
  readonly locations: readonly BoardLocation[];
  readonly beds: readonly BoardBed[];
  readonly capacity: readonly BedCapacity[];
}
