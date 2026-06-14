// PHASE 2 EXIT GATE — a COMPLETE antagonist ICSI cycle, end-to-end, with no
// external spreadsheet, against a real Postgres. Exercises the whole Phase 2
// stack and proves the exit-gate invariants in one flow:
//   • marriage hard-gate at cycle creation; consent-gated progression; the full
//     status lifecycle planned→…→outcome;
//   • stimulation charting (formulary-validated) + monitoring trigger → retrieval;
//   • embryology lab chain (oocyte → ICSI → 2PN → embryo → grading);
//   • the WITNESSING gate: a transfer is BLOCKED until RI Witness reconciles the
//     handling chain, then flows once matched (divergence/absence blocks sign-off);
//   • outcome continuum (β-hCG → clinical pregnancy → live birth) + Vienna KPI inputs;
//   • an embryo's full life history reconstructs and the audit chain verifies intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asId, fixedClock } from "@oxford/core";
import type { Session } from "@oxford/identity";
import {
  CycleService,
  StimulationService,
  MonitoringService,
  PgCycleStore,
  PgStimStore,
  PgMonitoringStore,
  InMemoryReasonCodeStore,
  type FertilityGate,
} from "@oxford/fertility";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*", "embryology:*"] }] },
  mfa: true,
};

describe.skipIf(!DATABASE_URL)("Phase 2 exit gate — complete antagonist ICSI cycle (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  let services: ReturnType<typeof buildServices>;
  let cycles: CycleService;
  let stim: StimulationService;
  let monitoring: MonitoringService;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
    // The cycle engine / stim / monitoring services share the one audit + event
    // chain. The marriage hard-gate is wired to the registry (no domain coupling).
    const gate: FertilityGate = { assertMayTreat: (coupleId) => services.registry.canStartFertility(asId<"Couple">(coupleId)) };
    cycles = new CycleService(new PgCycleStore(pool), services.audit, services.events, clock, gate, new InMemoryReasonCodeStore());
    stim = new StimulationService(new PgStimStore(pool), services.audit, services.events, clock);
    monitoring = new MonitoringService(new PgMonitoringStore(pool), services.audit, services.events);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("runs a full ICSI cycle: marriage gate → stim → trigger → lab → witnessed transfer → live birth", async () => {
    const actor = clinician.subject.staffId;

    // 1) Identity + marriage hard-gate.
    const husband = await services.registry.registerPerson(actor, { name: { ar: "علي", en: "Ali" }, civilId: "284010199001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const wife = await services.registry.registerPerson(actor, { name: { ar: "نورة", en: "Noura" }, civilId: "288050199002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const coupleR = await services.registry.createCouple(actor, husband.id, wife.id);
    expect(coupleR.ok).toBe(true);
    if (!coupleR.ok) return;
    const coupleId = coupleR.value.id;

    // ATTACK: create an ICSI cycle before the marriage is verified → blocked.
    const blocked = await cycles.createTreatmentCycle(actor, "icsi", coupleId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.detailKey).toBe("registry.marriage.unverified");

    await services.registry.verifyMarriage(actor, coupleId, { documentRef: "mrg-1", method: "certificate" });
    const cycleR = await cycles.createTreatmentCycle(actor, "icsi", coupleId);
    expect(cycleR.ok).toBe(true);
    if (!cycleR.ok) return;
    const cycleId = cycleR.value.id;

    // 2) Consent-gated progression: advancing before consents → blocked.
    const tooEarly = await cycles.advanceStatus(actor, cycleId, "stimulating");
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.detailKey).toBe("fertility.consent.incomplete");
    for (const c of ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]) {
      await cycles.recordConsent(actor, cycleId, c);
    }
    expect((await cycles.advanceStatus(actor, cycleId, "stimulating")).ok).toBe(true);

    // 3) Stimulation (antagonist): rFSH + GnRH antagonist, formulary-validated.
    const day = await stim.recordDay(actor, cycleId, { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }, { formularyItemId: "gnrh_antagonist", dose: 0.25, unit: "mg" }] });
    expect(day.ok).toBe(true);

    // 4) Monitoring → trigger schedules retrieval; lifecycle → triggered → retrieval.
    const visit = await monitoring.recordVisit(actor, cycleId, { visitAt: "2026-07-01T08:00:00Z", decision: "trigger", triggerAt: "2026-07-01T21:00:00.000Z" });
    expect(visit.ok && visit.value.retrieval).not.toBeNull();
    expect((await cycles.advanceStatus(actor, cycleId, "triggered")).ok).toBe(true);
    expect((await cycles.advanceStatus(actor, cycleId, "retrieval")).ok).toBe(true);

    // 5) Embryology lab chain: oocyte → ICSI → 2PN → embryo → grading.
    const oocyte = await services.embryology.recordOocyte(actor, { cycleId, retrievalProcedureId: "proc-1", maturity: "MII", dish: "D1", position: "A1" });
    const insem = await services.embryology.recordInsemination(actor, { cycleId, oocyteId: oocyte.id, method: "ICSI", spermSourceId: husband.id, operator: actor, inseminatedAt: "2026-07-03T09:00:00Z", patientId: wife.id });
    expect((await cycles.advanceStatus(actor, cycleId, "fertilisation")).ok).toBe(true);
    const check = await services.embryology.recordFertilisationCheck(actor, { cycleId, oocyteId: oocyte.id, pn: "2PN", checkedAt: "2026-07-04T09:00:00Z" });
    expect(check.embryo).not.toBeNull();
    const embryoId = check.embryo!.id;
    await services.embryology.recordGrading(actor, { embryoId, day: 5, morphology: "expanded blastocyst", gardner: { expansion: 4, icm: "A", te: "A" }, assessedAt: "2026-07-08T09:00:00Z" });
    expect((await cycles.advanceStatus(actor, cycleId, "culture")).ok).toBe(true);

    // 6) THE WITNESSING GATE. Before RI reconciles the ICSI handling event, a
    //    transfer is blocked; once RI confirms the matching record, it flows.
    const transferInput = { cycleId, embryoIds: [embryoId], catheter: "soft", difficulty: "easy" as const, ultrasoundGuided: true, operator: actor, transferredAt: "2026-07-08T10:00:00Z", patientId: wife.id };
    const blockedTransfer = await services.embryology.recordTransfer(actor, transferInput);
    expect(blockedTransfer.ok).toBe(false);
    if (!blockedTransfer.ok) expect(blockedTransfer.error.detailKey).toBe("witnessing.sign_off.blocked");

    services.witnessProvider.seedRecord(cycleId, { riRecordId: "ri-1", oxfordKey: insem.witnessKey, patientId: wife.id, sampleId: String(oocyte.id), outcome: "witnessed", witnessedAt: "2026-07-03T09:00:01Z" });
    await services.witnessing.ingest(actor, cycleId);
    const okTransfer = await services.embryology.recordTransfer(actor, transferInput);
    expect(okTransfer.ok && okTransfer.value.count).toBe(1);
    expect((await cycles.advanceStatus(actor, cycleId, "transfer")).ok).toBe(true);

    // 7) Outcome continuum → live birth; Vienna KPI inputs captured.
    expect((await cycles.advanceStatus(actor, cycleId, "luteal")).ok).toBe(true);
    await services.outcomes.recordPregnancyTest(actor, { cycleId, betaHcgMiuMl: 210, testedAt: "2026-07-20T08:00:00Z" });
    await services.outcomes.recordClinicalAssessment(actor, { cycleId, gestationalSacs: 1, fetalHeartbeats: 1, assessedAt: "2026-08-10T08:00:00Z" });
    await services.outcomes.recordPregnancyOutcome(actor, { cycleId, type: "live_birth", liveBirthCount: 1, gestationalAgeWeeks: 39, occurredAt: "2027-04-15T08:00:00Z" });
    expect((await cycles.advanceStatus(actor, cycleId, "outcome")).ok).toBe(true);
    expect(await services.outcomes.kpiInputs(cycleId)).toEqual({ biochemicalPregnancy: true, clinicalPregnancy: true, liveBirth: true, ongoing: false });

    // 8) Traceability: the embryo's full life history reconstructs…
    const history = await services.embryology.embryoLifeHistory(embryoId);
    expect(history.ok).toBe(true);
    if (history.ok) {
      expect(history.value.oocyte!.id).toBe(oocyte.id);
      expect(history.value.gradings).toHaveLength(1);
    }
    // …and the immutable audit chain that recorded every step verifies intact.
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });
});
