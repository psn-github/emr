// Deterministic PRNG for the synthetic-patient simulator. mulberry32 is tiny,
// fast and reproducible — the simulator NEVER uses Math.random, so a given
// --seed replays exactly the same journey decisions (couple variants, oocyte
// counts). Identity strings are namespaced per run separately (see journeys.ts)
// so re-runs against a persistent staging database cannot collide.

export type Rng = () => number;

/** mulberry32: a 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [min, max] (inclusive). */
export function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
