// P1 — ANTENATAL RECORD / obstetric continuum, end-to-end on real Postgres. Proves:
// a pregnancy is dated (EDD), a visit schedule is generated, serial visits derive
// gestation + risk flags and persist — with the audit chain intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const PATIENT = "pat-anc-1";

describe.skipIf(!DATABASE_URL)("P1 antenatal record (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE clinical.pregnancy, clinical.antenatal_visit");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("books a pregnancy, schedules visits, and records visits with risk flags", async () => {
    const booked = await services.antenatal.bookPregnancy("doc-1", { patientId: PATIENT, lmp: "2026-01-01", gravida: 2, para: 1, riskFactors: ["prior_pre_eclampsia"] });
    expect(booked.ok && booked.value.edd).toBe("2026-10-08");
    if (!booked.ok) return;

    const sched = await services.antenatal.plannedSchedule(booked.value.id);
    expect(sched.ok && sched.value.length).toBeGreaterThan(0);

    // normal visit + a pre-eclampsia visit (hypertensive + proteinuria, 3rd trimester)
    await services.antenatal.recordVisit("doc-1", { pregnancyId: booked.value.id, visitAt: "2026-04-02", bpSystolic: 118, bpDiastolic: 76, fundalHeightCm: 13 });
    const flagged = await services.antenatal.recordVisit("doc-1", { pregnancyId: booked.value.id, visitAt: "2026-08-01", bpSystolic: 150, bpDiastolic: 95, proteinuria: true, fundalHeightCm: 31 });
    expect(flagged.ok && flagged.value.riskFlags).toContain("pre_eclampsia_risk");

    // persisted history round-trips (numeric fundal height preserved)
    const visits = await services.antenatal.visits(booked.value.id);
    expect(visits).toHaveLength(2);
    expect(visits[0]!.fundalHeightCm).toBe(13);
    expect(visits[1]!.riskFlags).toContain("hypertension");

    // active-pregnancy lookup works
    const active = await services.antenatal.activePregnancyForPatient(PATIENT);
    expect(active?.id).toBe(booked.value.id);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
