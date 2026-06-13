import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { Fils } from "./money.js";
import { isValidAmount } from "./money.js";

// Deposits & instalment plans — pure logic (docs/01 §E11, ADR-0038). A plan pays
// down an invoice: a deposit (due immediately) plus dated instalments that must
// sum to the invoice total. Cycle-step progression is gated on ARREARS — the
// past-due amount not yet paid (deposit unpaid, or an instalment overdue beyond a
// configured grace window). Money is integer fils; 100% coverage (financial gate).

export interface InstalmentInput {
  readonly dueDate: string;
  readonly amountFils: Fils;
}

/** Validate a plan: positive total, valid deposit, ≥1 instalment with positive
 *  amounts and strictly increasing due dates, and deposit + instalments = total. */
export function validatePlan(totalFils: Fils, depositFils: Fils, instalments: readonly InstalmentInput[]): Result<void, AppError> {
  if (!isValidAmount(totalFils) || totalFils <= 0) return err(validationError("plan total must be a positive integer (fils)", "billing.plan.bad_total"));
  if (!isValidAmount(depositFils)) return err(validationError("deposit must be a non-negative integer (fils)", "billing.plan.bad_deposit"));
  if (instalments.length === 0) return err(validationError("a plan needs at least one instalment", "billing.plan.empty"));
  let prev = -Infinity;
  let sum = depositFils;
  for (const i of instalments) {
    if (!isValidAmount(i.amountFils) || i.amountFils <= 0) return err(validationError("instalment amount must be a positive integer (fils)", "billing.plan.bad_instalment"));
    const due = new Date(i.dueDate).getTime();
    if (Number.isNaN(due)) return err(validationError("instalment due date is invalid", "billing.plan.bad_due_date"));
    if (due <= prev) return err(validationError("instalment due dates must be strictly increasing", "billing.plan.due_dates_unordered"));
    prev = due;
    sum += i.amountFils;
  }
  if (sum !== totalFils) return err(validationError("deposit + instalments must equal the plan total", "billing.plan.sum_mismatch"));
  return ok(undefined);
}

/** The amount scheduled-due by `asOf`: the deposit (due immediately) plus every
 *  instalment whose due date + grace has passed. */
export function scheduledDue(depositFils: Fils, instalments: readonly InstalmentInput[], asOf: Date, graceDays: number): Fils {
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  let due = depositFils;
  for (const i of instalments) {
    if (new Date(i.dueDate).getTime() + graceMs <= asOf.getTime()) due += i.amountFils;
  }
  return due;
}

export interface ProgressionDecision {
  readonly allowed: boolean;
  readonly arrearsFils: Fils;
  readonly scheduledDueFils: Fils;
  readonly paidFils: Fils;
}

/** Progression is allowed only when nothing past-due is unpaid (arrears = 0). */
export function progressionDecision(depositFils: Fils, instalments: readonly InstalmentInput[], paidFils: Fils, asOf: Date, graceDays: number): ProgressionDecision {
  const due = scheduledDue(depositFils, instalments, asOf, graceDays);
  const arrears = Math.max(0, due - paidFils);
  return { allowed: arrears === 0, arrearsFils: arrears, scheduledDueFils: due, paidFils };
}
