import type { CycleStatus } from "./types.js";

// Patient-facing cycle timeline (docs/01 §E13). Pure: maps a cycle's status to an
// ordered "where am I / what's next" view. 100% coverage.

/** The ordered, non-terminal stages of a cycle (cancelled is out-of-band). */
export const CYCLE_STAGE_ORDER: readonly CycleStatus[] = [
  "planned",
  "stimulating",
  "triggered",
  "retrieval",
  "fertilisation",
  "culture",
  "transfer",
  "luteal",
  "outcome",
];

export type StepState = "done" | "current" | "upcoming";
export interface TimelineStep {
  readonly status: CycleStatus;
  readonly state: StepState;
}
export interface CycleTimeline {
  readonly current: CycleStatus;
  /** The next stage, or null at the final stage / when cancelled. */
  readonly next: CycleStatus | null;
  readonly cancelled: boolean;
  readonly steps: readonly TimelineStep[];
}

/** Build the ordered timeline for a cycle's current status. A cancelled cycle has
 *  no position in the journey (all stages upcoming, no next). */
export function cycleTimeline(status: CycleStatus): CycleTimeline {
  const cancelled = status === "cancelled";
  const idx = CYCLE_STAGE_ORDER.indexOf(status);
  const steps: TimelineStep[] = CYCLE_STAGE_ORDER.map((s, i) => ({
    status: s,
    state: cancelled ? "upcoming" : i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));
  const next = cancelled || idx < 0 || idx >= CYCLE_STAGE_ORDER.length - 1 ? null : CYCLE_STAGE_ORDER[idx + 1]!;
  return { current: status, next, cancelled, steps };
}
