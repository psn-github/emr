import type { ThawFacts } from "./ownership.js";
import type { SpecimenOwner } from "./types.js";

// Cryostore seams (dependency inversion). The app layer wires these to the real
// modules — cryostore depends on no other domain module directly.

/** Witnessing seam — every move/thaw/discard is a witnessed handling event,
 *  reconciled against RI Witness (authoritative). Cryostore never witnesses. */
export interface HandlingEventInput {
  readonly cycleId: string;
  readonly stepKey: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly occurredAt: string;
}
export interface WitnessPort {
  registerHandlingEvent(actorId: string, input: HandlingEventInput): Promise<void>;
}

/** Registry seam — supplies the use-time facts for the thaw re-gate. The facts
 *  come from the authoritative registry, never from the caller. */
export interface UseGate {
  thawFacts(owner: SpecimenOwner, coupleId: string): Promise<ThawFacts>;
}

/** Billing seam — raises the recurring annual storage charge (AMD-0003) via
 *  @oxford/billing. Integer fils; cryostore never does money arithmetic itself. */
export interface StorageChargeLine {
  readonly chargeCode: string;
  readonly descriptionEn: string;
  readonly descriptionAr: string;
  readonly amountFils: number;
}
export interface BillingPort {
  raiseStorageCharge(actorId: string, patientId: string, line: StorageChargeLine): Promise<string>;
}

/** Asset seam — supplies a linked tank's PPM (preventive-maintenance) due status
 *  from @oxford/assets. Returns null when the asset is unknown. Cryostore owns no
 *  maintenance schedule itself; the asset module is authoritative (docs/01 §E6 P2). */
export interface AssetPpmPort {
  ppmStatus(assetRef: string): Promise<{ readonly nextDueDate: string | null; readonly overdue: boolean } | null>;
}
