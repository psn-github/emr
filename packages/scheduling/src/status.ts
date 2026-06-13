import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { AppointmentStatus } from "./types.js";

// Appointment lifecycle. Captures no-show and cancellation explicitly for KPIs.
const ALLOWED: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  booked: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): Result<void, ReturnType<typeof validationError>> {
  if (!canTransition(from, to)) {
    return err(validationError(`illegal appointment transition ${from} → ${to}`, "scheduling.bad_transition"));
  }
  return ok(undefined);
}
