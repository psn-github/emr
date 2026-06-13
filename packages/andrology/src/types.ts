import type { Id } from "@oxford/core";

// Andrology types (docs/01 §E5). Semen analysis to WHO 6th-edition reference
// values with range flagging; sperm preparation; witnessed freeze with a
// cryostore link; surgical retrieval (TESA/TESE/PESA) linked to theatre.

export type SemenAnalysisId = Id<"SemenAnalysis">;
export type SpermPrepId = Id<"SpermPrep">;
export type SpermFreezeId = Id<"SpermFreeze">;
export type SurgicalRetrievalId = Id<"SurgicalRetrieval">;

/** The measured WHO 6th-ed semen parameters. Counts/percentages; no PHI. */
export interface SemenParameters {
  readonly volumeMl: number;
  readonly concentrationMillionPerMl: number;
  readonly totalCountMillion: number;
  readonly progressiveMotilityPct: number;
  readonly totalMotilityPct: number;
  readonly normalMorphologyPct: number;
  readonly vitalityPct: number;
}

/** Per-parameter flag against the reference lower limit. */
export type ReferenceFlag = "normal" | "below_reference";

export interface SemenFlags {
  readonly volume: ReferenceFlag;
  readonly concentration: ReferenceFlag;
  readonly totalCount: ReferenceFlag;
  readonly progressiveMotility: ReferenceFlag;
  readonly totalMotility: ReferenceFlag;
  readonly normalMorphology: ReferenceFlag;
  readonly vitality: ReferenceFlag;
}

export interface SemenAnalysis {
  readonly id: SemenAnalysisId;
  readonly patientId: string;
  readonly collectedAt: string;
  readonly parameters: SemenParameters;
  readonly flags: SemenFlags;
  /** True when every parameter meets or exceeds its reference lower limit. */
  readonly allWithinReference: boolean;
  readonly recordedBy: string;
}

export type PrepMethod = "density_gradient" | "swim_up" | "wash";

export interface SpermPrep {
  readonly id: SpermPrepId;
  readonly patientId: string;
  readonly method: PrepMethod;
  readonly postPrepConcentrationMillionPerMl: number;
  readonly postPrepProgressiveMotilityPct: number;
  readonly preparedBy: string;
  readonly preparedAt: string;
}

export interface SpermFreeze {
  readonly id: SpermFreezeId;
  readonly patientId: string;
  /** Logical reference to the cryostore specimen (owned by the cryostore module). */
  readonly cryoSpecimenRef: string;
  readonly straws: number;
  readonly frozenBy: string;
  readonly frozenAt: string;
  /** The witnessing key reconciled against the RI Witness record. */
  readonly witnessKey: string;
}

export type RetrievalMethod = "TESA" | "TESE" | "PESA";

export interface SurgicalRetrieval {
  readonly id: SurgicalRetrievalId;
  readonly patientId: string;
  readonly method: RetrievalMethod;
  readonly theatreBookingRef: string;
  readonly spermFound: boolean;
  readonly performedBy: string;
  readonly performedAt: string;
}
