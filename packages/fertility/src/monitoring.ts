import type { Id } from "@oxford/core";

// Monitoring-visit workflow + procedures (docs/01 §E3). A monitoring visit
// records the clinician's decision after scan/bloods; choosing `trigger`
// schedules the oocyte retrieval. Procedures (retrieval/transfer) carry a
// logical link to a theatre booking (scheduling), made in the app layer.

export type MonitoringVisitId = Id<"MonitoringVisit">;
export type ProcedureId = Id<"Procedure">;

export type MonitoringDecision = "continue" | "adjust" | "trigger" | "cancel";
export type ProcedureType = "retrieval" | "transfer";

export interface MonitoringVisit {
  readonly id: MonitoringVisitId;
  readonly cycleId: string;
  readonly visitAt: string;
  readonly decision: MonitoringDecision;
  readonly note: string | null;
  readonly nextVisitAt: string | null;
  readonly recordedBy: string;
}

export interface Procedure {
  readonly id: ProcedureId;
  readonly cycleId: string;
  readonly type: ProcedureType;
  readonly scheduledAt: string;
  /** Logical reference to a scheduling appointment (theatre slot), if booked. */
  readonly theatreBookingRef: string | null;
}
