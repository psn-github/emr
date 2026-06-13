import type { PnStatus } from "./types.js";

// Fertilisation interpretation (pure). Only 2PN is normal fertilisation and
// yields an embryo for culture; 0PN (failed), 1PN and 3PN (abnormal) do not
// proceed to a normal-fertilisation embryo. Abnormal handling is recorded but
// must never silently become a transferable embryo.

/** Does this pronuclear status represent normal (2PN) fertilisation? */
export function isNormalFertilisation(pn: PnStatus): boolean {
  return pn === "2PN";
}

/** Should a fertilisation check create a culture embryo? Only normal 2PN. */
export function yieldsEmbryo(pn: PnStatus): boolean {
  return isNormalFertilisation(pn);
}
