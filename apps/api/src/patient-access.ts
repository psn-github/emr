import type { Result } from "@oxford/core";
import { ok, err, forbidden } from "@oxford/core";

// Patient self-service identity guard. A patient principal is scoped to ONE
// patientId; portal actions may only ever touch that patient's own data
// (consent-gated partner access is a later feature). Pure + adversarially tested.

export interface PatientPrincipal {
  readonly patientId: string;
}

/** A patient may only act on their own record. */
export function assertOwnData(
  principal: PatientPrincipal,
  requestedPatientId: string,
): Result<void, ReturnType<typeof forbidden>> {
  if (principal.patientId !== requestedPatientId) {
    return err(forbidden("a patient may only access their own record", "portal.not_own_data"));
  }
  return ok(undefined);
}
