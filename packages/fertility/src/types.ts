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
  readonly cancellationReason: string | null;
  readonly createdAt: string;
}

/** A stimulation protocol (config). Default drug regimen detail lands in PR 2.2. */
export interface Protocol {
  readonly id: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly appliesTo: readonly CycleType[];
}
