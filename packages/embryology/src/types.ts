import type { Id } from "@oxford/core";

// Embryology types (docs/01 §E4). The lab records what it observed; witnessing
// is reconciled against RI Witness via the WitnessPort seam (never reimplemented
// here). Every gamete/embryo handling event is traceable oocyte → disposition →
// transfer/tank → outcome from the audit trail.

export type OocyteId = Id<"Oocyte">;
export type InseminationId = Id<"Insemination">;
export type FertilisationCheckId = Id<"FertilisationCheck">;
export type EmbryoId = Id<"Embryo">;
export type GradingEntryId = Id<"GradingEntry">;
export type DispositionId = Id<"Disposition">;
export type EmbryoTransferId = Id<"EmbryoTransfer">;

/** Oocyte maturity at retrieval. */
export type Maturity = "MII" | "MI" | "GV" | "degenerate";
/** Insemination method. */
export type InseminationMethod = "IVF" | "ICSI";
/** Pronuclear status at the fertilisation check. Only 2PN is normal fertilisation. */
export type PnStatus = "0PN" | "1PN" | "2PN" | "3PN";
/** Terminal embryo disposition — each is an auditable, witnessed handling event. */
export type DispositionType = "transfer" | "freeze" | "discard" | "pgt_biopsy";
/** Transfer catheter difficulty. */
export type TransferDifficulty = "easy" | "moderate" | "difficult";

/** Gardner blastocyst grade: expansion 1–6, ICM + trophectoderm A/B/C. */
export type GardnerLetter = "A" | "B" | "C";
export interface GardnerGrade {
  readonly expansion: number; // 1..6
  readonly icm: GardnerLetter;
  readonly te: GardnerLetter;
}

export interface Oocyte {
  readonly id: OocyteId;
  readonly cycleId: string;
  readonly retrievalProcedureId: string;
  readonly maturity: Maturity;
  readonly dish: string;
  readonly position: string;
  readonly recordedBy: string;
}

export interface Insemination {
  readonly id: InseminationId;
  readonly cycleId: string;
  readonly oocyteId: OocyteId;
  readonly method: InseminationMethod;
  readonly spermSourceId: string;
  readonly operator: string;
  readonly inseminatedAt: string;
  /** The witnessing key reconciled against the RI Witness record. */
  readonly witnessKey: string;
}

export interface FertilisationCheck {
  readonly id: FertilisationCheckId;
  readonly oocyteId: OocyteId;
  readonly cycleId: string;
  readonly pn: PnStatus;
  readonly checkedAt: string;
  readonly recordedBy: string;
}

export interface Embryo {
  readonly id: EmbryoId;
  readonly cycleId: string;
  readonly oocyteId: OocyteId;
  readonly createdAt: string;
}

export interface GradingEntry {
  readonly id: GradingEntryId;
  readonly embryoId: EmbryoId;
  readonly day: number;
  readonly morphology: string;
  /** Gardner grade for blastocyst-stage assessment; null for cleavage days. */
  readonly gardner: GardnerGrade | null;
  readonly recordedBy: string;
  readonly assessedAt: string;
}

export interface Disposition {
  readonly id: DispositionId;
  readonly embryoId: EmbryoId;
  readonly cycleId: string;
  readonly type: DispositionType;
  readonly occurredAt: string;
  readonly operator: string;
  readonly witnessKey: string;
}

export interface EmbryoTransfer {
  readonly id: EmbryoTransferId;
  readonly cycleId: string;
  readonly embryoIds: readonly EmbryoId[];
  readonly count: number;
  readonly catheter: string;
  readonly difficulty: TransferDifficulty;
  readonly ultrasoundGuided: boolean;
  readonly procedureRef: string | null;
  readonly operator: string;
  readonly transferredAt: string;
  readonly witnessKey: string;
}
