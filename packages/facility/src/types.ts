import type { Id } from "@oxford/core";

// The building modelled as addressable locations (docs/01 §E1, docs/02 §3).
// Names are bilingual config data (nameAr/nameEn) — not hardcoded strings.

export type FloorLevel = "ground" | "L1" | "L2" | "L3";

export type LocationNodeType =
  | "consult_room"
  | "scan_room"
  | "theatre"
  | "recovery_bed"
  | "inpatient_bed"
  | "holding"
  | "pharmacy"
  | "waiting"
  | "lab";

/** Bed lifecycle for the flow board (PR 1.3 reads these). */
export type BedStatus = "free" | "occupied" | "cleaning" | "blocked";

export type FloorId = Id<"Floor">;
export type LocationNodeId = Id<"LocationNode">;
export type BedId = Id<"Bed">;

export interface BilingualName {
  readonly ar: string;
  readonly en: string;
}

export interface Floor {
  readonly id: FloorId;
  readonly level: FloorLevel;
  readonly name: BilingualName;
}

export interface LocationNode {
  readonly id: LocationNodeId;
  readonly level: FloorLevel;
  readonly type: LocationNodeType;
  readonly name: BilingualName;
  readonly capacity: number;
}

export interface Bed {
  readonly id: BedId;
  readonly locationNodeId: LocationNodeId;
  readonly label: string;
  readonly status: BedStatus;
}
