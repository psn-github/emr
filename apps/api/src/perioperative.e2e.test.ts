// CROSS-CUTTING e2e — the perioperative journey THROUGH the tRPC API against real
// Postgres, on the seeded facility (ADR-0023). Proves: the full pathway drives
// audited bed/floor movements with correct bed-board occupancy; bed capacity is
// enforced (the 7th L2 admission is blocked — the "list exceeds beds" flag); RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedFacility } from "@oxford/facility";
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

const L2 = (cap: readonly { level: string; occupied: number }[]) => cap.find((c) => c.level === "L2")!.occupied;

describe.skipIf(!DATABASE_URL)("perioperative journey (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, registry.person, audit.audit_log");
    services = buildServices(pool);
    await seedFacility(services.facility);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function patient(civilId: string): Promise<string> {
    const p = await doc.registry.registerPerson({ name: { ar: "مريض", en: "Patient" }, civilId, dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
    return p.personId;
  }

  it("runs the full journey end-to-end with audited movements and correct bed occupancy", async () => {
    const pid = await patient("290010100001");
    const { encounterId, stage } = await doc.perioperative.admit({ patientId: pid, indication: "oocyte retrieval", admittedAt: "2026-06-22T08:00:00Z" });
    expect(stage).toBe("admitted");

    for (const s of ["ward_bed", "pre_theatre", "in_theatre", "recovery", "post_op_ward"] as const) {
      const r = await doc.perioperative.advance({ encounterId, toStage: s });
      expect(r.stage).toBe(s);
    }
    // on the post-op ward, exactly one L2 bed is occupied
    expect(L2((await services.flow.board()).capacity)).toBe(1);

    await doc.perioperative.advance({ encounterId, toStage: "discharged" });
    expect(L2((await services.flow.board()).capacity)).toBe(0); // bed freed on discharge

    // every floor transfer was audited
    const moves = (await services.audit.entries()).filter((e) => e.payload.entityType === "PatientLocation");
    expect(moves.length).toBeGreaterThanOrEqual(6);
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });

  it("enforces L2 bed capacity — the 7th ward admission is blocked (list exceeds 6 beds)", async () => {
    for (let i = 1; i <= 6; i++) {
      const pid = await patient(`2900101100${10 + i}`);
      const { encounterId } = await doc.perioperative.admit({ patientId: pid, indication: "case", admittedAt: "2026-06-22T08:00:00Z" });
      const r = await doc.perioperative.advance({ encounterId, toStage: "ward_bed" });
      expect(r.stage).toBe("ward_bed");
    }
    expect(L2((await services.flow.board()).capacity)).toBe(6); // all six L2 beds full

    const seventh = await patient("290010110099");
    const { encounterId } = await doc.perioperative.admit({ patientId: seventh, indication: "case", admittedAt: "2026-06-22T08:00:00Z" });
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "ward_bed" }), "CONFLICT");
  });

  it("RBAC: a reception role cannot admit a surgical patient", async () => {
    const pid = await patient("290010100002");
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.admit({ patientId: pid, indication: "x", admittedAt: "2026-06-22T08:00:00Z" }), "FORBIDDEN");
  });
});
