import type { InstalmentPlan, InstalmentPlanId } from "./types.js";

export interface InstalmentStore {
  savePlan(p: InstalmentPlan): Promise<void>;
  getPlan(id: InstalmentPlanId): Promise<InstalmentPlan | null>;
  /** Active plans for a patient (drives the progression gate). */
  activePlansForPatient(patientId: string): Promise<readonly InstalmentPlan[]>;
  /** All active plans (drives the instalment-risk dashboard). */
  allActivePlans(): Promise<readonly InstalmentPlan[]>;
}

export class InMemoryInstalmentStore implements InstalmentStore {
  private readonly plans = new Map<string, InstalmentPlan>();

  async savePlan(p: InstalmentPlan): Promise<void> {
    this.plans.set(p.id, p);
  }
  async getPlan(id: InstalmentPlanId): Promise<InstalmentPlan | null> {
    return this.plans.get(id) ?? null;
  }
  async activePlansForPatient(patientId: string): Promise<readonly InstalmentPlan[]> {
    return [...this.plans.values()].filter((p) => p.patientId === patientId && p.status === "active");
  }
  async allActivePlans(): Promise<readonly InstalmentPlan[]> {
    return [...this.plans.values()].filter((p) => p.status === "active");
  }
}
