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
export type MediaApplicationId = Id<"MediaApplication">;

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

/**
 * A culture-media (or other consumable) lot applied to a specific embryo/oocyte
 * at a lab step — the append-only fact that powers media-recall reachability. The
 * lot is identified by (itemId, lotNo): the SAME identifiers the inventory
 * catalogue/stock use, so a manufacturer recall of a lot maps straight to the
 * embryos exposed. This is a shared-identifier cross-reference, NOT a cross-module
 * dependency — embryology never imports inventory.
 */
export interface MediaApplication {
  readonly id: MediaApplicationId;
  readonly cycleId: string;
  /** The embryo exposed, or null when the media touched an oocyte pre-embryo. */
  readonly embryoId: EmbryoId | null;
  /** The oocyte exposed, or null when applied directly to a named embryo. */
  readonly oocyteId: OocyteId | null;
  /** Catalogue media item id (inventory's identifier). */
  readonly itemId: string;
  /** Media lot number (inventory's stock-lot identifier) — the recall key. */
  readonly lotNo: string;
  /** The lab step the media was used at (e.g. "fertilisation", "culture-d3"). */
  readonly step: string;
  readonly quantity: number;
  readonly appliedAt: string;
  readonly operator: string;
}

// PGT order/consent/result capture (docs/01 §E4 P1; genetics lab stays external).
// Permitted indications are clinic CONFIGURATION (bounded by counsel) — never
// hardcoded here.
export type PgtOrderId = Id<"PgtOrder">;
export type PgtResultId = Id<"PgtResult">;
export type PgtType = "PGT-A" | "PGT-M" | "PGT-SR";
export type PgtResultStatus = "euploid" | "aneuploid" | "mosaic" | "no_result";

export interface PgtOrder {
  readonly id: PgtOrderId;
  readonly embryoId: EmbryoId;
  readonly cycleId: string;
  readonly type: PgtType;
  readonly indication: string;
  /** Reference to the captured PGT consent in the document store (required). */
  readonly consentDocumentRef: string;
  readonly orderedBy: string;
  readonly orderedAt: string;
}

export interface PgtResult {
  readonly id: PgtResultId;
  readonly orderId: PgtOrderId;
  readonly embryoId: EmbryoId;
  readonly status: PgtResultStatus;
  /** Reference to the external genetics-lab report in the document store. */
  readonly reportRef: string;
  readonly resolvedAt: string;
  readonly recordedBy: string;
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

// Lab QC log (docs/01 §E5 P1): periodic quality readings — incubator gas/temp,
// media pH/osmolality — evaluated against configured acceptable ranges. References
// equipment (assetRef) and media lots (lotNo) by reference; no cross-module access.
export type LabQcReadingId = Id<"LabQcReading">;
export type LabQcStatus = "pass" | "fail";

/** A QC parameter with its acceptable range (versioned config; bilingual). */
export interface LabQcParameter {
  readonly code: string;
  readonly name: { readonly ar: string; readonly en: string };
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly active: boolean;
}

export interface LabQcReading {
  readonly id: LabQcReadingId;
  readonly parameterCode: string;
  readonly value: number;
  readonly unit: string;
  /** Equipment this reading was taken on (e.g. an incubator), or null. */
  readonly assetRef: string | null;
  /** Media lot this reading relates to (links to an inventory lot by ref), or null. */
  readonly lotNo: string | null;
  readonly status: LabQcStatus;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly note: string | null;
}
