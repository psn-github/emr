import type { Appointment, ResourceId } from "./types.js";

// Double-booking prevention. Two slots conflict if they share a resource and
// their half-open time intervals [start, end) overlap. Cancelled / no-show
// appointments hold no resource and are ignored by the caller.

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface ProposedSlot {
  readonly resourceIds: readonly ResourceId[];
  readonly start: string;
  readonly end: string;
  /** Exclude this appointment id (e.g. when rescheduling itself). */
  readonly excludeId?: string;
}

/** Existing appointments that clash with the proposed slot (shared resource + overlap). */
export function findConflicts(
  existing: readonly Appointment[],
  proposed: ProposedSlot,
): readonly Appointment[] {
  const wanted = new Set<string>(proposed.resourceIds);
  return existing.filter((appt) => {
    if (appt.id === proposed.excludeId) return false;
    if (!appt.resourceIds.some((r) => wanted.has(r))) return false;
    return intervalsOverlap(proposed.start, proposed.end, appt.start, appt.end);
  });
}
