// Theatre utilisation + turnaround analytics (pure, 100%) — docs/01 §E7 P1.
// Computes, for a set of a theatre's cases on a day: booked minutes, utilisation
// against the available session minutes, and total turnaround (idle gaps between
// consecutive cases). Inputs are ISO instants; arithmetic is in whole minutes.

export interface CaseInterval {
  readonly start: string;
  readonly end: string;
}

export interface TheatreUtilisation {
  readonly caseCount: number;
  readonly bookedMinutes: number;
  readonly availableMinutes: number;
  /** Booked ÷ available, 0–100, rounded; 0 when no session time is available. */
  readonly utilisationPct: number;
  /** Total idle minutes between consecutive cases (turnaround/gaps). */
  readonly turnaroundMinutes: number;
}

const MIN = 60_000;

export function theatreUtilisation(cases: readonly CaseInterval[], availableMinutes: number): TheatreUtilisation {
  const sorted = [...cases].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  let bookedMinutes = 0;
  let turnaroundMinutes = 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    bookedMinutes += Math.max(0, (new Date(c.end).getTime() - new Date(c.start).getTime()) / MIN);
    if (i > 0) {
      const gap = (new Date(c.start).getTime() - new Date(sorted[i - 1]!.end).getTime()) / MIN;
      if (gap > 0) turnaroundMinutes += gap;
    }
  }
  const utilisationPct = availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0;
  return { caseCount: sorted.length, bookedMinutes, availableMinutes, utilisationPct, turnaroundMinutes };
}
