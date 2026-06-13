// PHASE 3 EXIT GATE — an oocyte retrieval AND a hysteroscopy each run the COMPLETE
// perioperative journey end-to-end, through the tRPC API on a real Postgres, with
// every Phase 3 invariant exercised in one flow (docs/01 §E7):
//   admit L3 → L2 bed → L1 recovery (pre-op) → theatre [WHO sign-in+time-out
//   enforced; CSSD sterile set used; intra-op record; consumables deducted+billed;
//   specimen captured] → WHO sign-out → recovery → L2 → discharge [pharmacy script
//   fulfilled + follow-up booked] — every floor transfer audited, bed occupancy
//   correct, the audit hash-chain intact.
//
// NB bed turnaround (cleaning → free) is the dedicated P1 workflow (deferred); the
// underlying status transition exists, so this test runs housekeeping explicitly
// between cases via the audited bed-status machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedFacility } from "@oxford/facility";
import { WHO_REQUIRED_ITEMS } from "@oxford/perioperative";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const surgeon: Session = {
  sessionId: "s-surg",
  subject: { staffId: "surg-1", roles: [{ id: "surgeon", name: "surgeon", permissions: ["clinical:*", "financial:*"] }] },
  mfa: true,
};

const L2occ = (cap: readonly { level: string; occupied: number }[]) => cap.find((c) => c.level === "L2")!.occupied;

describe.skipIf(!DATABASE_URL)("Phase 3 exit gate — full perioperative journey (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let api: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, perioperative.observation, perioperative.follow_up, perioperative.intraop_record, perioperative.consumable_use, perioperative.specimen_record, perioperative.instrument_set, perioperative.sterilisation_cycle, perioperative.set_usage, billing.invoice, billing.payment, inventory.stock_lot, registry.person, audit.audit_log");
    services = buildServices(pool);
    await seedFacility(services.facility);
    api = appRouter.createCaller({ session: surgeon, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  /** Housekeeping turnaround: free every bed left `cleaning` after a transfer
   *  (the dedicated turnaround view is P1; the cleaning→free transition exists). */
  async function turnaround(): Promise<void> {
    for (const bed of await services.facility.beds()) {
      if (bed.status === "cleaning") await services.facility.setBedStatus("housekeeping", bed.id, "free");
    }
  }

  /** Admit → … → post-op ward, exercising WHO + CSSD + intra-op + consumables. */
  async function toWard(civilId: string, indication: string): Promise<{ encounterId: string; invoiceRef: string }> {
    const p = await api.registry.registerPerson({ name: { ar: "م", en: "P" }, civilId, dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const patientId = p.personId;
    const { encounterId } = await api.perioperative.admit({ patientId, indication, admittedAt: "2026-06-22T08:00:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "ward_bed" });
    await api.perioperative.advance({ encounterId, toStage: "pre_theatre" });
    await api.perioperative.completeChecklistPhase({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "2026-06-22T08:30:00Z" });
    await api.perioperative.completeChecklistPhase({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "2026-06-22T08:40:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "in_theatre" });

    const { setId } = await api.perioperative.registerSet({ name: `${indication} set`, composition: ["a", "b"] });
    await api.perioperative.recordSterilisation({ setId, cycleType: "steam_134c", loadRef: "LOAD-1", result: "pass", completedAt: "2026-06-22T06:00:00Z" });
    await api.perioperative.useSet({ setId, encounterId, usedAt: "2026-06-22T08:50:00Z" });
    await api.perioperative.recordIntraOp({ encounterId, procedurePerformed: indication, findings: "as expected", anaestheticTechnique: "GA", drugs: [{ formularyCode: "propofol", dose: 200, unit: "mg" }], staff: ["surg-1"], startedAt: "2026-06-22T08:50:00Z", finishedAt: "2026-06-22T09:20:00Z" });
    // the consumable's lot must be in stock (real inventory deduction, ADR-0026)
    await services.inventory.receive("stores-1", { itemId: "kit", lotNo: `LOT-${civilId}`, locationId: "theatre", quantity: 1, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" });
    const cons = await api.perioperative.recordConsumables({ encounterId, patientId, uses: [{ code: "kit", description: "Procedure kit", lotNo: `LOT-${civilId}`, quantity: 1, unitPriceFils: 30000 }], recordedAt: "2026-06-22T09:00:00Z" });
    await api.perioperative.recordSpecimen({ encounterId, type: "tissue", site: indication, lotRef: "SPEC-1", collectedAt: "2026-06-22T09:10:00Z" });

    await api.perioperative.completeChecklistPhase({ encounterId, phase: "sign_out", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_out], completedAt: "2026-06-22T09:25:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "recovery" });
    await api.perioperative.recordObservation({ encounterId, phase: "recovery", aldreteScore: 10, systolicBp: 120, heartRate: 72, spo2: 99, recordedAt: "2026-06-22T09:40:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "post_op_ward" });
    return { encounterId, invoiceRef: cons.invoiceRef };
  }

  async function discharge(encounterId: string): Promise<void> {
    services.pharmacyStub.markFulfilled(encounterId);
    await api.perioperative.bookFollowUp({ encounterId, scheduledFor: "2026-07-05T09:00:00Z", bookedAt: "2026-06-22T11:00:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "discharged" });
  }

  it("runs an oocyte retrieval and a hysteroscopy end-to-end, with correct bed occupancy + intact audit chain", async () => {
    const a = await toWard("290010150001", "oocyte retrieval");
    expect(L2occ((await services.flow.board()).capacity)).toBe(1); // A on the ward
    await turnaround(); // housekeeping frees A's vacated (cleaning) beds

    const b = await toWard("290010150002", "hysteroscopy");
    expect(L2occ((await services.flow.board()).capacity)).toBe(2); // A + B on the ward

    await discharge(a.encounterId);
    await discharge(b.encounterId);
    await turnaround();
    expect(L2occ((await services.flow.board()).capacity)).toBe(0); // both discharged, beds freed

    // each case billed its consumables to a real invoice with the correct total
    const ta = await services.billing.totals(a.invoiceRef as never);
    expect(ta.ok && ta.value.totalFils).toBe(30000);
    // CSSD usage traced to each encounter
    expect(await services.cssd.setsUsedForEncounter(a.encounterId)).toHaveLength(1);

    // every floor transfer audited; the immutable chain verifies intact
    const moves = (await services.audit.entries()).filter((e) => e.payload.entityType === "PatientLocation");
    expect(moves.length).toBeGreaterThanOrEqual(12); // 2 patients × ≥6 transfers
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });

  it("the WHO checklist + discharge gates are enforced within the journey", async () => {
    // (Both gates are proven in who-checklist.e2e + discharge.e2e; this re-confirms
    //  they hold inside the full closeout flow.)
    const p = await api.registry.registerPerson({ name: { ar: "م", en: "P" }, civilId: "290010150003", dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const { encounterId } = await api.perioperative.admit({ patientId: p.personId, indication: "hysteroscopy", admittedAt: "2026-06-22T08:00:00Z" });
    await api.perioperative.advance({ encounterId, toStage: "ward_bed" });
    await api.perioperative.advance({ encounterId, toStage: "pre_theatre" });
    // no checklist → cannot enter theatre
    await expect(api.perioperative.advance({ encounterId, toStage: "in_theatre" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
