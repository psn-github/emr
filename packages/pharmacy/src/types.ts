import type { Id } from "@oxford/core";

// @oxford/pharmacy types (ADR-0066): the Ground-floor dispensing workflow. A
// prescription is raised by a clinician for a patient (optionally linked to a
// discharge encounter); its items are FORMULARY-ONLY (validated via the injected
// FormularyPort — there is no free-text drug shape, so a non-formulary item is
// structurally impossible). The patient/encounter/prescriber are referenced by
// LOGICAL id only (no cross-module table access — module boundaries).

export type PrescriptionId = Id<"Prescription">;
export type DispenseId = Id<"Dispense">;

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
 *  chain flags) so the record is self-describing and dispensing does not re-read. */
export interface PrescriptionItem extends PrescriptionItemInput {
  readonly nameEn: string;
  readonly nameAr: string;
  readonly drugClass: string;
  readonly controlled: boolean;
  readonly coldChain: boolean;
}

/** The dispensing-queue lifecycle. `cancelled` is reachable pre-dispense only. */
export type PrescriptionStatus = "pending" | "dispensing" | "ready" | "collected" | "cancelled";

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
  readonly cancelReason: string | null;
  readonly raisedAt: string;
  readonly updatedAt: string;
}

/** A single lot consumed to fulfil a prescribed item (FEFO-chosen or manually
 *  specified). Recorded on the dispense so the physical hand-over is lot-traced. */
export interface DispenseAllocation {
  readonly drugId: string;
  readonly lotNo: string;
  readonly expiry: string;
  readonly quantity: number;
}

export interface Dispense {
  readonly id: DispenseId;
  readonly prescriptionId: string;
  readonly dispensedBy: string;
  readonly allocations: readonly DispenseAllocation[];
  /** Asserted true by the dispenser for a prescription containing cold-chain items. */
  readonly coldChainHandled: boolean;
  /** The second-person witness for a prescription containing controlled items. */
  readonly witnessStaffId: string | null;
  readonly dispensedAt: string;
}
