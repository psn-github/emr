import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { InstalmentPlan, InstalmentPlanId } from "./types.js";
import type { InstalmentStore } from "./instalment-store.js";
import type { BillingService } from "./billing-service.js";
import { validatePlan, progressionDecision, type InstalmentInput, type ProgressionDecision } from "./instalments.js";

export interface CreatePlanInput {
  readonly patientId: string;
  readonly invoiceId: string;
  readonly depositFils: number;
  readonly instalments: readonly InstalmentInput[];
}

/** The cycle-progression gate (ADR-0038): the consuming flow (fertility/
 *  embryology) injects this and BLOCKS a step when a patient's plan is in arrears.
 *  Defined here as the published contract; wired in the app composition root. */
export interface FinanceGate {
  /** Allowed only when no instalment plan for the patient is in arrears as of `asOf`. */
  assertProgressionAllowed(patientId: string, asOf: Date): Promise<Result<void, AppError>>;
}

/**
 * Deposits & instalment plans (docs/01 §E11, ADR-0038). A plan pays down an
 * invoice; the invoice's net payments (via BillingService) are the source of
 * truth for "paid". `assessProgression` decides whether a cycle step may proceed:
 * blocked when ARREARS > 0 (deposit unpaid, or an instalment overdue beyond the
 * configured grace). The grace window is configuration. Money is 100% covered.
 */
export class InstalmentService {
  constructor(
    private readonly store: InstalmentStore,
    private readonly billing: BillingService,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    /** Grace days before an overdue instalment counts as arrears (config; default 0). */
    private readonly graceDays = 0,
  ) {}

  /** Create a plan against an invoice. The plan total must equal the invoice total. */
  async createPlan(actorId: string, input: CreatePlanInput): Promise<Result<InstalmentPlan, AppError>> {
    const totals = await this.billing.totals(asId<"Invoice">(input.invoiceId));
    if (!totals.ok) return err(totals.error);
    const v = validatePlan(totals.value.totalFils, input.depositFils, input.instalments);
    if (!v.ok) return err(v.error);
    const plan: InstalmentPlan = {
      id: newId<"InstalmentPlan">(),
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      totalFils: totals.value.totalFils,
      depositFils: input.depositFils,
      instalments: input.instalments.map((i) => ({ dueDate: i.dueDate, amountFils: i.amountFils })),
      status: "active",
      createdAt: this.clock.now().toISOString(),
    };
    await this.store.savePlan(plan);
    await this.audit.record({ actorId, entityType: "InstalmentPlan", entityId: plan.id, action: "CREATE", after: { invoiceId: input.invoiceId, totalFils: plan.totalFils, instalments: plan.instalments.length } });
    await this.events.emit({ type: "InstalmentPlanCreated", aggregateType: "InstalmentPlan", aggregateId: plan.id, data: { invoiceId: input.invoiceId } });
    return ok(plan);
  }

  /** Decide whether progression is allowed for a specific plan as of `asOf`. */
  async assessProgression(planId: string, asOf: Date): Promise<Result<ProgressionDecision, AppError>> {
    const plan = await this.store.getPlan(asId<"InstalmentPlan">(planId));
    if (plan === null) return err(notFound("instalment plan not found", "billing.plan.not_found"));
    return ok(await this.decide(plan, asOf));
  }

  /** FinanceGate: progression is allowed unless ANY active plan for the patient is
   *  in arrears as of `asOf`. (No plan → allowed; nothing owed past-due → allowed.) */
  async assertProgressionAllowed(patientId: string, asOf: Date): Promise<Result<void, AppError>> {
    const plans = await this.store.activePlansForPatient(patientId);
    for (const plan of plans) {
      const decision = await this.decide(plan, asOf);
      if (!decision.allowed) {
        return err(validationError("cycle progression blocked: instalment plan in arrears", "billing.progression.blocked"));
      }
    }
    return ok(undefined);
  }

  private async decide(plan: InstalmentPlan, asOf: Date): Promise<ProgressionDecision> {
    const totals = await this.billing.totals(asId<"Invoice">(plan.invoiceId));
    const paid = totals.ok ? totals.value.paidFils : 0;
    return progressionDecision(plan.depositFils, plan.instalments, paid, asOf, this.graceDays);
  }

  planById(id: InstalmentPlanId): Promise<InstalmentPlan | null> {
    return this.store.getPlan(id);
  }
}
