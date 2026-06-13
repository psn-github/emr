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
