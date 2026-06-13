import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Trigger-timing calculator (docs/01 §E3). Oocyte retrieval is scheduled a fixed
// interval after the trigger injection (default 36h). Pure + 100% tested.
export const DEFAULT_TRIGGER_TO_RETRIEVAL_HOURS = 36;
const HOUR_MS = 3_600_000;

/** Retrieval instant = trigger instant + lead hours. Rejects a bad date/lead. */
export function computeRetrievalTime(
  triggerAtIso: string,
  leadHours: number = DEFAULT_TRIGGER_TO_RETRIEVAL_HOURS,
): Result<string, ReturnType<typeof validationError>> {
  const t = Date.parse(triggerAtIso);
  if (Number.isNaN(t)) return err(validationError("invalid trigger time", "fertility.trigger.bad_time"));
  if (!Number.isFinite(leadHours) || leadHours <= 0) {
    return err(validationError("lead hours must be positive", "fertility.trigger.bad_lead"));
  }
  return ok(new Date(t + leadHours * HOUR_MS).toISOString());
}

/** Hours remaining until a target instant (negative once elapsed). */
export function countdownHours(now: Date, targetIso: string): number {
  return (Date.parse(targetIso) - now.getTime()) / HOUR_MS;
}
