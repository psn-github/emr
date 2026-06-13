// CROSS-CUTTING e2e — the DISCHARGE GATE THROUGH the tRPC API on real Postgres
// (docs/01 §E7; ADR-0025). Discharge from L2 is blocked until the discharge
// prescription is fulfilled by pharmacy AND a follow-up is booked. Also records
// recovery observations. Runs the journey to post-op ward first.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedFacility } from "@oxford/facility";
import { WHO_REQUIRED_ITEMS } from "@oxford/perioperative";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("discharge gate (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, perioperative.observation, perioperative.follow_up, registry.person, audit.audit_log");
    services = buildServices(pool);
    await seedFacility(services.facility);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function toPostOpWard(): Promise<{ encounterId: string }> {
    const p = await doc.registry.registerPerson({ name: { ar: "م", en: "P" }, civilId: "290010140001", dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const { encounterId } = await doc.perioperative.admit({ patientId: p.personId, indication: "oocyte retrieval", admittedAt: "2026-06-22T08:00:00Z" });
    await doc.perioperative.advance({ encounterId, toStage: "ward_bed" });
    await doc.perioperative.advance({ encounterId, toStage: "pre_theatre" });
    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "2026-06-22T08:30:00Z" });
    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "2026-06-22T08:40:00Z" });
    await doc.perioperative.advance({ encounterId, toStage: "in_theatre" });
    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "sign_out", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_out], completedAt: "2026-06-22T09:30:00Z" });
    await doc.perioperative.advance({ encounterId, toStage: "recovery" });
    await doc.perioperative.recordObservation({ encounterId, phase: "recovery", aldreteScore: 9, systolicBp: 120, heartRate: 70, spo2: 98, recordedAt: "2026-06-22T10:00:00Z" });
    await doc.perioperative.advance({ encounterId, toStage: "post_op_ward" });
    return { encounterId };
  }

  it("blocks discharge until prescription fulfilled AND follow-up booked", async () => {
    const { encounterId } = await toPostOpWard();

    // nothing yet → blocked
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

    // pharmacy fulfils the script (stub) — still need a follow-up
    services.pharmacyStub.markFulfilled(encounterId);
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

    // book the follow-up → discharge allowed; the L2 bed frees
    await doc.perioperative.bookFollowUp({ encounterId, scheduledFor: "2026-07-05T09:00:00Z", bookedAt: "2026-06-22T11:00:00Z" });
    const discharged = await doc.perioperative.advance({ encounterId, toStage: "discharged" });
    expect(discharged.stage).toBe("discharged");
    const l2 = (await services.flow.board()).capacity.find((c) => c.level === "L2")!;
    expect(l2.occupied).toBe(0);
  });
});
