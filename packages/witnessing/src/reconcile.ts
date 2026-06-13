import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, preconditionFailed } from "@oxford/core";
import type {
  DivergenceReason,
  OxfordHandlingEvent,
  RiWitnessRecord,
  WitnessReconciliation,
  WitnessStatus,
} from "./types.js";

// Pure reconciliation core. No I/O, no time-of-day, no override path. This is
// the witnessing safety logic held to 100% coverage. RI Witness is
// authoritative: where Oxford and RI disagree, the event is `divergent` and
// sign-off is blocked. There is intentionally no parameter, flag, or branch
// that can force a non-matched event to `matched`.

interface Determination {
  readonly status: WitnessStatus;
  readonly reason: DivergenceReason | null;
  readonly riRecordId: string | null;
}

/** Decide the status of one handling event against the available RI records.
 *  Order matters: an RI-flagged mismatch is the strongest signal, then
 *  identity divergence, then absence (not-yet-synced). */
function determine(event: OxfordHandlingEvent, riRecords: readonly RiWitnessRecord[]): Determination {
  const ri = riRecords.find((r) => r.oxfordKey === event.oxfordKey);
  if (ri === undefined) return { status: "pending_sync", reason: "no_ri_record", riRecordId: null };
  if (ri.outcome === "mismatch")
    return { status: "divergent", reason: "ri_flagged_mismatch", riRecordId: ri.riRecordId };
  if (ri.patientId !== event.patientId)
    return { status: "divergent", reason: "patient_mismatch", riRecordId: ri.riRecordId };
  if (ri.sampleId !== event.sampleId)
    return { status: "divergent", reason: "sample_mismatch", riRecordId: ri.riRecordId };
  return { status: "matched", reason: null, riRecordId: ri.riRecordId };
}

/** Reconcile a single handling event into a ledger row. */
export function reconcileEvent(
  event: OxfordHandlingEvent,
  riRecords: readonly RiWitnessRecord[],
  reconciledAt: string,
): WitnessReconciliation {
  const d = determine(event, riRecords);
  return {
    id: newId<"WitnessReconciliation">(),
    cycleId: event.cycleId,
    handlingEventId: event.id,
    oxfordKey: event.oxfordKey,
    riRecordId: d.riRecordId,
    status: d.status,
    reason: d.reason,
    reconciledAt,
  };
}

/** RI records with no corresponding Oxford handling event: RI witnessed a
 *  handling Oxford never recorded. Always divergent — never silently ignored. */
export function orphanRiRecords(
  events: readonly OxfordHandlingEvent[],
  riRecords: readonly RiWitnessRecord[],
): readonly RiWitnessRecord[] {
  return riRecords.filter((r) => !events.some((e) => e.oxfordKey === r.oxfordKey));
}

/** Reconcile every handling event for a cycle, plus a synthetic divergent row
 *  for each orphan RI record. */
export function reconcileCycle(
  events: readonly OxfordHandlingEvent[],
  riRecords: readonly RiWitnessRecord[],
  reconciledAt: string,
): readonly WitnessReconciliation[] {
  const eventRows = events.map((e) => reconcileEvent(e, riRecords, reconciledAt));
  const orphanRows = orphanRiRecords(events, riRecords).map((r) => orphanRow(r, reconciledAt));
  return [...eventRows, ...orphanRows];
}

function orphanRow(r: RiWitnessRecord, reconciledAt: string): WitnessReconciliation {
  return {
    id: newId<"WitnessReconciliation">(),
    cycleId: "",
    handlingEventId: null,
    oxfordKey: r.oxfordKey,
    riRecordId: r.riRecordId,
    status: "divergent",
    reason: "orphan_ri_record",
    reconciledAt,
  };
}

/**
 * The sign-off gate. Returns ok ONLY when every reconciliation row is
 * `matched`; any `pending_sync` or `divergent` row blocks. No override
 * argument exists — divergence cannot be waved through.
 */
export function assertSignOffAllowed(
  rows: readonly WitnessReconciliation[],
): Result<void, AppError> {
  const blocking = rows.filter((r) => r.status !== "matched");
  if (blocking.length > 0) {
    return err(
      preconditionFailed(
        `cycle-step sign-off blocked: ${blocking.length} handling event(s) not reconciled with RI Witness`,
        "witnessing.sign_off.blocked",
      ),
    );
  }
  return ok(undefined);
}
