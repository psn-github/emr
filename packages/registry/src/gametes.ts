import type { Couple } from "./couple.js";
import type { PersonId } from "./person.js";

// Own gametes only (docs/03 §1, ADR-0005). These are TOTAL functions over a
// couple — there is no donor branch to take, because no donor concept exists.
// A `sperm_source` always resolves to the husband; an `oocyte_source` always
// resolves to the wife.

export function spermSource(couple: Couple): PersonId {
  return couple.husbandPersonId;
}

export function oocyteSource(couple: Couple): PersonId {
  return couple.wifePersonId;
}
