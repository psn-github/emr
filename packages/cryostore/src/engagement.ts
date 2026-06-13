import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { EngagementState } from "./types.js";

// AMD-0003 non-engagement / non-payment pathway (pure, 100%). A GRADUATED state
// machine: reminders → overdue → clinical/legal review. There is deliberately NO
// state and NO action that destroys a specimen — terminal disposition is a
// reviewed human step, bounded by the pending legal confirms, handled outside
// this machine. A payment (`renew_paid`) always returns the account to current.

export type EngagementAction = "remind" | "mark_overdue" | "escalate_review" | "renew_paid";

const TRANSITIONS: Record<EngagementState, Partial<Record<EngagementAction, EngagementState>>> = {
  current: { remind: "reminded", renew_paid: "current" },
  reminded: { mark_overdue: "overdue", renew_paid: "current" },
  overdue: { escalate_review: "in_legal_review", renew_paid: "current" },
  // Even under review, paying clears it; escalation does not auto-dispose.
  in_legal_review: { renew_paid: "current" },
};

/** Advance the non-engagement pathway. Rejects out-of-order transitions so the
 *  pathway stays graduated (e.g. you cannot jump straight to legal review). */
export function nextEngagementState(current: EngagementState, action: EngagementAction): Result<EngagementState, AppError> {
  const next = TRANSITIONS[current][action];
  if (next === undefined) {
    return err(validationError(`cannot ${action} from ${current}`, "cryostore.engagement.bad_transition"));
  }
  return ok(next);
}
