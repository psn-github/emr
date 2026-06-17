// Provisional L2 bed reservation for a day's theatre list (pure, 100%). Each
// scheduled case provisionally reserves an L2 inpatient bed for its day; when the
// day's list would reserve more beds than exist (6 × L2), the list is FLAGGED
// (not blocked — it's a capacity warning surfaced to the coordinator, docs/01 §E7).

export interface BedReservationStatus {
  readonly reserved: number;
  readonly capacity: number;
  /** True when the day's list reserves more L2 beds than are available. */
  readonly exceedsBeds: boolean;
}

export function bedReservationStatus(reserved: number, capacity: number): BedReservationStatus {
  return { reserved, capacity, exceedsBeds: reserved > capacity };
}

// Bed-occupancy forecast (docs/01 §E1 P2): look forward across the booked theatre
// list and answer "will the six L2 beds cover the coming days?". Pure date math;
// the per-day reserved counts are supplied by the service from scheduled cases.
const DAY_MS = 86_400_000;

/** ISO calendar date (YYYY-MM-DD) n days after a YYYY-MM-DD date. */
export function addDaysIso(date: string, n: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface BedOccupancyDay extends BedReservationStatus {
  readonly date: string;
}
export interface BedOccupancyForecast {
  readonly from: string;
  readonly days: number;
  readonly capacity: number;
  readonly entries: readonly BedOccupancyDay[];
  /** How many days in the horizon would exceed the L2 bed count. */
  readonly daysExceeding: number;
}
