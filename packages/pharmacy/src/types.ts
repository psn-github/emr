import type { Id } from "@oxford/core";

// @oxford/pharmacy types (ADR-0069 — supersedes the dispensing model of ADR-0066).
// Two distinct flows:
//   (1) PRESCRIPTIONS — the clinic ISSUES a formulary-only prescription (incl. a
//       discharge script) that the EXTERNAL Ground-floor pharmacy fulfils. No
//       clinic stock moves; fulfilment is an audited handover confirmation.
//   (2) THEATRE DRUG ADMINISTRATION — the anaesthetic + controlled drugs the clinic
//       itself stocks (L1). Administration decrements clinic stock (FEFO/lot), posts
//       witnessed controlled-drugs register movements, and asserts cold-chain.
// The patient/encounter/prescriber/witness are referenced by LOGICAL id only (no
// cross-module table access — module boundaries).

export type PrescriptionId = Id<"Prescription">;
export type TheatreAdministrationId = Id<"TheatreDrugAdministration">;

/** Bilingual dose instruction (no hardcoded user-facing strings — CLAUDE.md). */
export interface DoseInstruction {
  readonly en: string;
  readonly ar: string;
}

/** A prescribed line as submitted by the prescriber: a formulary drug id, a whole
 *  quantity, and a bilingual dose instruction. `drugId` MUST validate against the
 *  FormularyPort — free text is not a representable shape. */
export interface PrescriptionItemInput {
  readonly drugId: string;
  readonly quantity: number;
  readonly doseInstruction: DoseInstruction;
}

/** A prescribed line enriched, at raise time, with an immutable snapshot of the
 *  formulary/catalogue attributes (bilingual name + drug class + controlled/cold-
 *  chain flags) so the record is self-describing. */
export interface PrescriptionItem extends PrescriptionItemInput {
  readonly nameEn: string;
  readonly nameAr: string;
  readonly drugClass: string;
  readonly controlled: boolean;
  readonly coldChain: boolean;
}

/** The prescription lifecycle (ADR-0069): `pending → issued → fulfilled`, with
 *  `cancel` reachable pre-fulfilment only (from `pending` or `issued`). A prescription
 *  never moves clinic stock — `fulfilled` is the external pharmacy's handover
 *  confirmation, not a dispense. */
export type PrescriptionStatus = "pending" | "issued" | "fulfilled" | "cancelled";

/** One prescribed drug that matched a recorded patient allergy (by drug class).
 *  ADVISORY ONLY (ADR-0060) — recorded on the prescription, never blocks. */
export interface AllergyWarning {
  readonly drugId: string;
  readonly drugClass: string;
}

export interface Prescription {
  readonly id: PrescriptionId;
  readonly patientId: string;
  /** The discharge encounter this script belongs to (the L2 discharge-gate case),
   *  or null for a plain clinic prescription. */
  readonly encounterId: string | null;
  readonly prescriberId: string;
  readonly items: readonly PrescriptionItem[];
  readonly status: PrescriptionStatus;
  readonly allergyWarnings: readonly AllergyWarning[];
  /** External pharmacy's reference for the fulfilled handover (optional), recorded
   *  by ward/reception staff when the external pharmacy has supplied. */
  readonly externalRef: string | null;
  /** Optional non-clinical note captured at fulfilment. */
  readonly fulfilmentNote: string | null;
  readonly cancelReason: string | null;
  readonly raisedAt: string;
  readonly updatedAt: string;
}

// ── Theatre drug administration (the clinic's real in-house stock) ─────────────

/** A theatre drug to administer: a formulary drug id and a whole quantity (the
 *  stock units decremented from theatre stock). */
export interface TheatreDrugInput {
  readonly drugId: string;
  readonly quantity: number;
}

/** A theatre drug line enriched with an immutable snapshot of the composite-
 *  formulary/catalogue attributes at administration time. */
export interface TheatreDrugItem extends TheatreDrugInput {
  readonly nameEn: string;
  readonly nameAr: string;
  readonly drugClass: string;
  readonly controlled: boolean;
  readonly coldChain: boolean;
}

/** A single lot consumed to fulfil a theatre drug line (FEFO-chosen from theatre
 *  stock). Recorded on the administration so the physical use is lot-traced. */
export interface StockAllocation {
  readonly drugId: string;
  readonly lotNo: string;
  readonly expiry: string;
  readonly quantity: number;
}

export interface TheatreDrugAdministration {
  readonly id: TheatreAdministrationId;
  readonly encounterId: string;
  readonly patientId: string;
  readonly administeredBy: string;
  readonly items: readonly TheatreDrugItem[];
  /** The lots consumed from theatre stock (FEFO). */
  readonly allocations: readonly StockAllocation[];
  /** Asserted true by the administrator when any drug is cold-chain. */
  readonly coldChainHandled: boolean;
  /** The second-person witness required when any drug is controlled. */
  readonly witnessStaffId: string | null;
  /** The theatre stock location the drugs were drawn from (config default). */
  readonly locationId: string;
  readonly administeredAt: string;
}
