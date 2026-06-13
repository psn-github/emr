// e2e — clinician-gated result release to the patient portal THROUGH the tRPC API
// on real Postgres (docs/01 §E13, ADR-0042). Proves: a filed result is INVISIBLE
// in the portal until a clinician releases it; once released the patient sees it;
// own-data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const clinician: Session = { sessionId: "s-doc", subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] }, mfa: true };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("portal released results (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE clinical.encounter, clinical.clinical_note, clinical.clinical_order, clinical.result, clinical.letter, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a filed result is invisible until released; then the patient sees it; cross-patient forbidden", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    const enc = await doc.clinical.openEncounter({ patientId: "pat-1", type: "consultation", practitionerId: "doc-1" });
    const order = await doc.clinical.placeOrder({ encounterId: enc.encounterId, patientId: "pat-1", kind: "lab", code: "AMH" });
    const filed = await doc.clinical.fileResult({ orderId: order.orderId, summary: "AMH 1.2 ng/mL", abnormal: false });

    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    // unreleased → not visible
    expect((await me.portal.results({ patientId: "pat-1" })).results).toHaveLength(0);

    // clinician releases it → now visible to the patient
    await doc.clinical.releaseResult({ resultId: filed.resultId });
    const visible = await me.portal.results({ patientId: "pat-1" });
    expect(visible.results).toHaveLength(1);
    expect(visible.results[0]!.summary).toBe("AMH 1.2 ng/mL");
    expect(visible.results[0]!.releasedToPatient).toBe(true);

    // a different patient sees nothing, and cross-patient is forbidden
    const other = appRouter.createCaller({ session: null, patient: { patientId: "pat-2" }, services });
    expect((await other.portal.results({ patientId: "pat-2" })).results).toHaveLength(0);
    await expectCode(() => other.portal.results({ patientId: "pat-1" }), "FORBIDDEN");
  });

  it("RBAC: releasing a result requires the clinical release permission", async () => {
    const reception = appRouter.createCaller({ session: { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false }, patient: null, services });
    await expectCode(() => reception.clinical.releaseResult({ resultId: "x" }), "FORBIDDEN");
  });
});
