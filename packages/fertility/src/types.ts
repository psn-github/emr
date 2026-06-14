import type { Id } from "@oxford/core";

// Fertility cycle engine (docs/01 §E3). Treatment cycles are couple-scoped
// (marriage hard-gate); fertility-preservation is the ONLY person-scoped cycle
// type (ADR-0015/AMD-0002). Drugs/dosing come in PR 2.2; this is the cycle +
// protocol + consent spine.

export type CycleId = Id<"Cycle">;

export type CycleType =
  | "iui"
  | "ivf"
  | "icsi"
  | "fet"
  | "ivm"
  | "fertility_preservation"
  | "ovulation_induction";

/** The only person-scoped cycle type. */
export const PERSON_SCOPED_TYPES: ReadonlySet<CycleType> = new Set<CycleType>(["fertility_preservation"]);

export type CycleOwner =
  | { readonly kind: "couple"; readonly coupleId: string }
  | { readonly kind: "person"; readonly personId: string };

export type CycleStatus =
  | "planned"
  | "stimulating"
  | "triggered"
  | "retrieval"
  | "fertilisation"
  | "culture"
  | "transfer"
  | "luteal"
  | "outcome"
  | "cancelled";

export interface Cycle {
  readonly id: CycleId;
  readonly type: CycleType;
  readonly owner: CycleOwner;
  readonly protocolId: string | null;
  readonly status: CycleStatus;
  /** Consent keys signed for this cycle (gates progression out of `planned`). */
  readonly signedConsents: readonly string[];
  /** Coded cancellation reason (config; never free text) — null unless cancelled. */
  readonly cancellationReasonCode: string | null;
  /** Snapshot of the reason's KPI category at cancel time (config can change later). */
  readonly cancellationCategory: CancellationCategory | null;
  /** Optional free-text clinical note accompanying a cancellation (not a config value). */
  readonly cancellationNote: string | null;
  /** Set on a cycle CREATED by converting another (e.g. IVF→IUI); links to the source. */
  readonly convertedFromId: CycleId | null;
  readonly createdAt: string;
}

/** Why a cycle was cancelled, coded for KPI aggregation (config — docs/01 §E3 P1).
 *  `converted` is reserved for the source side of a cycle conversion and is
 *  excluded from the true cancellation rate. */
export type CancellationCategory =
  | "clinical"
  | "poor_response"
  | "ohss_risk"
  | "patient_choice"
  | "administrative"
  | "converted";

/** A cancellation reason code (versioned config, bilingual; never free text). */
export interface CancellationReasonCode {
  readonly code: string;
  readonly category: CancellationCategory;
  readonly name: { readonly ar: string; readonly en: string };
  readonly active: boolean;
}

/** A stimulation protocol (config). Default drug regimen detail lands in PR 2.2. */
export interface Protocol {
  readonly id: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly appliesTo: readonly CycleType[];
}
