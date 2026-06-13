import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { InstalmentPlan, InstalmentPlanId, Instalment } from "./types.js";
import type { InstalmentStore } from "./instalment-store.js";

/** Postgres-backed InstalmentStore. Money is integer fils; instalments are jsonb. */
export class PgInstalmentStore implements InstalmentStore {
  constructor(private readonly pool: Pool) {}

  async savePlan(p: InstalmentPlan): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing.instalment_plan (id, patient_id, invoice_id, total_fils, deposit_fils, instalments, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, instalments=EXCLUDED.instalments`,
      [p.id, p.patientId, p.invoiceId, p.totalFils, p.depositFils, JSON.stringify(p.instalments), p.status, p.createdAt],
    );
  }
  async getPlan(id: InstalmentPlanId): Promise<InstalmentPlan | null> {
    const r = await this.pool.query<PlanRow>("SELECT * FROM billing.instalment_plan WHERE id = $1", [id]);
    return r.rows[0] ? planFrom(r.rows[0]) : null;
  }
  async activePlansForPatient(patientId: string): Promise<readonly InstalmentPlan[]> {
    const r = await this.pool.query<PlanRow>("SELECT * FROM billing.instalment_plan WHERE patient_id = $1 AND status = 'active'", [patientId]);
    return r.rows.map(planFrom);
  }
  async allActivePlans(): Promise<readonly InstalmentPlan[]> {
    const r = await this.pool.query<PlanRow>("SELECT * FROM billing.instalment_plan WHERE status = 'active'", []);
    return r.rows.map(planFrom);
  }
}

interface PlanRow { id: string; patient_id: string; invoice_id: string; total_fils: string | number; deposit_fils: string | number; instalments: Instalment[]; status: string; created_at: Date }

function planFrom(r: PlanRow): InstalmentPlan {
  return { id: asId<"InstalmentPlan">(r.id), patientId: r.patient_id, invoiceId: r.invoice_id, totalFils: Number(r.total_fils), depositFils: Number(r.deposit_fils), instalments: r.instalments, status: r.status as InstalmentPlan["status"], createdAt: new Date(r.created_at).toISOString() };
}
