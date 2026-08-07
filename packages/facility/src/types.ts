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

// ── Topology as CONFIGURATION DATA (CLAUDE.md: "configuration is data") ───────
// The building layout is a declarative spec that an admin APPLIES; applying it
// is idempotent (see FacilityService.applyTopology), so it is safe to re-run on
// every deploy/simulation against a persistent database.

/** A location in the spec, with the beds (by label) it holds. */
export interface LocationSpec {
  readonly level: FloorLevel;
  readonly type: LocationNodeType;
  readonly name: BilingualName;
  readonly capacity: number;
  /** Bed labels belonging to this location (empty for non-bedded locations). */
  readonly beds?: readonly string[];
}

export interface TopologySpec {
  readonly floors: readonly { readonly level: FloorLevel; readonly name: BilingualName }[];
  readonly locations: readonly LocationSpec[];
}

/** What an applyTopology run created (and the resulting totals). */
export interface TopologyResult {
  readonly created: { readonly floors: number; readonly locations: number; readonly beds: number };
  readonly totals: { readonly floors: number; readonly locations: number; readonly beds: number };
}
