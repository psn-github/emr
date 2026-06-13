import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validatePlan, scheduledDue, progressionDecision, type InstalmentInput } from "./instalments.js";
import { InstalmentService } from "./instalment-service.js";
import { InMemoryInstalmentStore } from "./instalment-store.js";
import { BillingService } from "./billing-service.js";
import { InMemoryBillingStore } from "./store.js";
import type { InstalmentPlan } from "./types.js";

const instals: InstalmentInput[] = [
  { dueDate: "2026-07-01T00:00:00Z", amountFils: 400000 },
  { dueDate: "2026-08-01T00:00:00Z", amountFils: 400000 },
];

describe("instalment plan logic (pure)", () => {
  it("validates a plan (deposit + instalments = total; ordered dates; positive amounts)", () => {
    expect(validatePlan(1000000, 200000, instals).ok).toBe(true);
    expect(detail(validatePlan(0, 0, instals))).toBe("billing.plan.bad_total");
    expect(detail(validatePlan(1000000, -1, instals))).toBe("billing.plan.bad_deposit");
    expect(detail(validatePlan(1000000, 200000, []))).toBe("billing.plan.empty");
    expect(detail(validatePlan(1000000, 200000, [{ dueDate: "2026-07-01T00:00:00Z", amountFils: 0 }]))).toBe("billing.plan.bad_instalment");
    expect(detail(validatePlan(1000000, 200000, [{ dueDate: "not-a-date", amountFils: 800000 }]))).toBe("billing.plan.bad_due_date");
    expect(detail(validatePlan(1200000, 200000, [{ dueDate: "2026-08-01T00:00:00Z", amountFils: 500000 }, { dueDate: "2026-07-01T00:00:00Z", amountFils: 500000 }]))).toBe("billing.plan.due_dates_unordered");
    expect(detail(validatePlan(999999, 200000, instals))).toBe("billing.plan.sum_mismatch");
  });

  it("computes scheduled-due and the progression decision (arrears blocks)", () => {
    const dep = 200000;
    // before any instalment is due: only the deposit is scheduled
    expect(scheduledDue(dep, instals, new Date("2026-06-15T00:00:00Z"), 0)).toBe(200000);
    // after the first instalment date: deposit + first
    expect(scheduledDue(dep, instals, new Date("2026-07-02T00:00:00Z"), 0)).toBe(600000);
    // grace pushes the due-count out
    expect(scheduledDue(dep, instals, new Date("2026-07-02T00:00:00Z"), 7)).toBe(200000);
    // decision: paid covers scheduled → allowed; short → blocked with arrears
    expect(progressionDecision(dep, instals, 200000, new Date("2026-06-15T00:00:00Z"), 0)).toEqual({ allowed: true, arrearsFils: 0, scheduledDueFils: 200000, paidFils: 200000 });
    expect(progressionDecision(dep, instals, 200000, new Date("2026-07-02T00:00:00Z"), 0)).toEqual({ allowed: false, arrearsFils: 400000, scheduledDueFils: 600000, paidFils: 200000 });
  });
});

function build(graceDays = 0) {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const billing = new BillingService(new InMemoryBillingStore(), audit, events, clock);
  const store = new InMemoryInstalmentStore();
  const svc = new InstalmentService(store, billing, audit, events, clock, graceDays);
  return { svc, billing, store };
}

async function invoiced(billing: BillingService): Promise<string> {
  const r = await billing.createInvoice("fin-1", "pat-1", [{ chargeCode: "ICSI", description: { ar: "ICSI", en: "ICSI" }, unitAmountFils: 1000000, quantity: 1 }]);
  if (!r.ok) throw new Error("setup");
  return r.value.id;
}

describe("InstalmentService", () => {
  it("creates a plan against an invoice and gates progression on arrears", async () => {
    const { svc, billing } = build();
    const invoiceId = await invoiced(billing);
    const plan = await svc.createPlan("fin-1", { patientId: "pat-1", invoiceId, depositFils: 200000, instalments: instals });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // deposit unpaid → blocked (deposit is due immediately)
    const d0 = await svc.assessProgression(plan.value.id, new Date("2026-06-15T00:00:00Z"));
    expect(d0.ok && d0.value.allowed).toBe(false);
    expect(d0.ok && d0.value.arrearsFils).toBe(200000);
    // pay the deposit → allowed (nothing else due yet)
    await billing.postPayment("fin-1", asId<"Invoice">(invoiceId), 200000, "knet");
    const d1 = await svc.assessProgression(plan.value.id, new Date("2026-06-15T00:00:00Z"));
    expect(d1.ok && d1.value.allowed).toBe(true);
    // first instalment now due, unpaid → blocked again
    const d2 = await svc.assessProgression(plan.value.id, new Date("2026-07-02T00:00:00Z"));
    expect(d2.ok && d2.value.allowed).toBe(false);

    // the FinanceGate (by patient) reflects the same arrears
    expect((await svc.assertProgressionAllowed("pat-1", new Date("2026-07-02T00:00:00Z"))).ok).toBe(false);
    expect((await svc.assertProgressionAllowed("pat-1", new Date("2026-06-15T00:00:00Z"))).ok).toBe(true);
    // a patient with no plan is never blocked
    expect((await svc.assertProgressionAllowed("nobody", new Date("2026-07-02T00:00:00Z"))).ok).toBe(true);
    expect((await svc.planById(plan.value.id))!.depositFils).toBe(200000);
  });

  it("rejects a plan whose total ≠ the invoice, and an unknown invoice/plan", async () => {
    const { svc, billing } = build();
    const invoiceId = await invoiced(billing); // total 1,000,000
    const bad = await svc.createPlan("fin-1", { patientId: "pat-1", invoiceId, depositFils: 100000, instalments: [{ dueDate: "2026-07-01T00:00:00Z", amountFils: 100000 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("billing.plan.sum_mismatch");
    expect(detail(await svc.createPlan("fin-1", { patientId: "p", invoiceId: "ghost", depositFils: 0, instalments: instals }))).toBe("billing.invoice.not_found");
    expect(detail(await svc.assessProgression("ghost", new Date()))).toBe("billing.plan.not_found");
  });

  it("treats a plan whose invoice is missing as fully unpaid (defensive)", async () => {
    const { svc, store } = build();
    const orphan: InstalmentPlan = { id: asId<"InstalmentPlan">("p-orphan"), patientId: "pat-9", invoiceId: "missing", totalFils: 1000000, depositFils: 200000, instalments: instals, status: "active", createdAt: "2026-06-13T08:00:00Z" };
    await store.savePlan(orphan);
    const d = await svc.assessProgression("p-orphan", new Date("2026-06-15T00:00:00Z"));
    expect(d.ok && d.value.paidFils).toBe(0); // totals unavailable → paid 0
    expect(d.ok && d.value.allowed).toBe(false);
  });
});

function detail(r: { ok: boolean; error?: { detailKey?: string } }): string | undefined {
  return r.ok ? undefined : r.error?.detailKey;
}
