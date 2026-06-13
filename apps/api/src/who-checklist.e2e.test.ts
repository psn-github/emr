// CROSS-CUTTING e2e — the WHO Surgical Safety Checklist as a BLOCKING gate on the
// perioperative journey, THROUGH the tRPC API on real Postgres (docs/01 §E7).
// Proves: no theatre entry without sign-in + time-out; no leaving theatre without
// sign-out; the legitimate path flows once each phase is completed; RBAC.
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
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("WHO checklist blocking gate (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, registry.person, audit.audit_log");
    services = buildServices(pool);
    await seedFacility(services.facility);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function admitToPreTheatre(): Promise<string> {
    const p = await doc.registry.registerPerson({ name: { ar: "م", en: "P" }, civilId: "290010130001", dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const { encounterId } = await doc.perioperative.admit({ patientId: p.personId, indication: "hysteroscopy", admittedAt: "2026-06-22T08:00:00Z" });
    await doc.perioperative.advance({ encounterId, toStage: "ward_bed" });
    await doc.perioperative.advance({ encounterId, toStage: "pre_theatre" });
    return encounterId;
  }

  it("blocks incision until sign-in + time-out, then blocks leaving theatre until sign-out", async () => {
    const encounterId = await admitToPreTheatre();

    // No checklist yet → cannot enter theatre.
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "in_theatre" }), "PRECONDITION_FAILED");

    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "2026-06-22T08:30:00Z" });
    // still missing time-out → still blocked
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "in_theatre" }), "PRECONDITION_FAILED");

    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "2026-06-22T08:40:00Z" });
    const entered = await doc.perioperative.advance({ encounterId, toStage: "in_theatre" });
    expect(entered.stage).toBe("in_theatre");

    // Cannot leave theatre (→ recovery) without sign-out.
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "recovery" }), "PRECONDITION_FAILED");
    await doc.perioperative.completeChecklistPhase({ encounterId, phase: "sign_out", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_out], completedAt: "2026-06-22T09:30:00Z" });
    const recovered = await doc.perioperative.advance({ encounterId, toStage: "recovery" });
    expect(recovered.stage).toBe("recovery");
  });

  it("rejects an out-of-order phase and a reception role", async () => {
    const encounterId = await admitToPreTheatre();
    // time-out before sign-in → rejected
    await expectCode(() => doc.perioperative.completeChecklistPhase({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "z" }), "BAD_REQUEST");
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.completeChecklistPhase({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "z" }), "FORBIDDEN");
  });
});
