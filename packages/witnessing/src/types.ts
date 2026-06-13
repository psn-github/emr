import type { Id } from "@oxford/core";

// Witnessing types (CLAUDE.md hard rule; docs/03 + docs/02 §Witnessing).
//
// RI Witness (RFID) in the lab is the AUTHORITATIVE witness system. Oxford HIS
// does NOT witness — it integrates:
//   • demographic master INTO RI Witness (patient/sample identifiers flow out);
//   • consumer of witnessing/traceability BACK (RI records flow in);
//   • reconciles every handling event against the RI Witness record;
//   • BLOCKS cycle-step sign-off on any divergence.
// There is deliberately no competing witness UI and no override of RI Witness.
// These types model that reconciliation — never an independent witnessing act.

export type HandlingEventId = Id<"HandlingEvent">;
export type ReconciliationId = Id<"WitnessReconciliation">;

/** Reconciliation status of an Oxford handling event vs the RI Witness record.
 *  Only `matched` permits cycle-step sign-off — `pending_sync` and `divergent`
 *  both block. */
export type WitnessStatus = "matched" | "pending_sync" | "divergent";

/** Why a reconciliation is not `matched` (non-PHI, machine-readable). */
export type DivergenceReason =
  | "no_ri_record" // RI has not (yet) returned a record for this key
  | "ri_flagged_mismatch" // RI Witness electronically flagged a mismatch
  | "patient_mismatch" // RI record's patient differs from the handling event
  | "sample_mismatch" // RI record's sample differs from the handling event
  | "orphan_ri_record"; // RI witnessed a handling Oxford never recorded

/** Outcome RI Witness returns for a witnessed handling. */
export type RiWitnessOutcome = "witnessed" | "mismatch";

/**
 * A handling event Oxford recorded for a cycle step (e.g. sperm-to-oocyte,
 * embryo load for transfer). `oxfordKey` is the stable identifier both systems
 * agree on (Oxford is demographic master, so it mints the key and RI echoes it
 * back). Reconciliation matches on `oxfordKey`.
 */
export interface OxfordHandlingEvent {
  readonly id: HandlingEventId;
  readonly cycleId: string;
  readonly stepKey: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly occurredAt: string;
  readonly recordedBy: string;
}

/** A witnessing record returned by RI Witness (the authoritative system). */
export interface RiWitnessRecord {
  readonly riRecordId: string;
  readonly oxfordKey: string;
  readonly patientId: string;
  readonly sampleId: string;
  readonly outcome: RiWitnessOutcome;
  readonly witnessedAt: string;
}

/** The reconciliation ledger row: one per handling event (plus synthetic rows
 *  for orphan RI records). Append-only audit trail of agreement/divergence. */
export interface WitnessReconciliation {
  readonly id: ReconciliationId;
  readonly cycleId: string;
  readonly handlingEventId: HandlingEventId | null;
  readonly oxfordKey: string;
  readonly riRecordId: string | null;
  readonly status: WitnessStatus;
  readonly reason: DivergenceReason | null;
  readonly reconciledAt: string;
}
