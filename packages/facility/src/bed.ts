import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { BedStatus } from "./types.js";

// Bed status transitions (small clinical-ops state machine). Modelled explicitly
// so the flow board can't be driven into a nonsense state (e.g. straight from
// cleaning to occupied without going free).
const ALLOWED: Record<BedStatus, readonly BedStatus[]> = {
  free: ["occupied", "blocked"],
  occupied: ["cleaning", "blocked"],
  cleaning: ["free", "blocked"],
  blocked: ["free"],
};

export function canTransition(from: BedStatus, to: BedStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(
  from: BedStatus,
  to: BedStatus,
): Result<void, ReturnType<typeof validationError>> {
  if (from === to) return ok(undefined);
  if (!canTransition(from, to)) {
    return err(validationError(`illegal bed transition ${from} → ${to}`, "facility.bed.bad_transition"));
  }
  return ok(undefined);
}
