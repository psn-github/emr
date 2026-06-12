// Injectable clock. Domain code never calls `new Date()` / `Date.now()`
// directly — it takes a Clock — so time-dependent logic (consent/storage
// expiry, audit timestamps) is deterministically testable.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock frozen at a fixed instant; advanceable in tests. */
export function fixedClock(start: Date): Clock & { set(d: Date): void; advanceMs(ms: number): void } {
  let current = new Date(start.getTime());
  return {
    now: () => new Date(current.getTime()),
    set: (d: Date) => {
      current = new Date(d.getTime());
    },
    advanceMs: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
