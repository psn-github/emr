import type { Id } from "@oxford/core";

// Scheduling across all four levels (docs/01 §E1). Resources (rooms, scanners,
// theatres, practitioners, equipment) are bookable; a room/theatre resource
// carries a logical `locationRef` into the facility module (no cross-module
// import — module boundaries). Appointment types are config data.

export type ResourceKind = "practitioner" | "room" | "scanner" | "theatre" | "equipment";
export type FloorLevel = "ground" | "L1" | "L2" | "L3";

export type ResourceId = Id<"Resource">;
export type AppointmentTypeId = Id<"AppointmentType">;
export type AppointmentId = Id<"Appointment">;

export interface BilingualName {
  readonly ar: string;
  readonly en: string;
}

export interface Resource {
  readonly id: ResourceId;
  readonly kind: ResourceKind;
  readonly name: BilingualName;
  readonly level?: FloorLevel;
  /** Logical reference to a facility LocationNode (rooms/theatres/scanners). */
  readonly locationRef?: string;
}

/** Appointment type = config (docs/02 §1): duration, the resource kinds it needs,
 *  prep instructions, default billing item. */
export interface AppointmentType {
  readonly id: AppointmentTypeId;
  readonly name: BilingualName;
  readonly durationMin: number;
  readonly requiredResourceKinds: readonly ResourceKind[];
  readonly prep?: BilingualName;
  readonly defaultBillingItem?: string;
}

export type AppointmentStatus =
  | "booked"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Appointment {
  readonly id: AppointmentId;
  readonly typeId: AppointmentTypeId;
  /** Patient the appointment is for — PHI; access is RBAC-gated at the API. */
  readonly patientId: string;
  readonly practitionerId: ResourceId;
  /** All resources reserved for the slot (practitioner + room/scanner/etc.). */
  readonly resourceIds: readonly ResourceId[];
  /** Half-open interval [start, end) as ISO instants. */
  readonly start: string;
  readonly end: string;
  readonly status: AppointmentStatus;
  readonly cancellationReason?: string;
}
