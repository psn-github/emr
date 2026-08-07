// PHASE 7.3 — ROUTER GAPS 1–3, end-to-end THROUGH the tRPC API on real Postgres
// (docs/PHASE7_PLAN §7.3). Each gap is a THIN router surface over an existing,
// fully-tested service; this file proves each one is reachable over the API on a
// FRESH database (nothing pre-seeded in-process), that config mutations are
// admin-gated, and that the audit hash-chain stays intact:
//
//   gap 1 — scheduling config: define appointment types + resources (admin), list
//           them (front desk), and BOOK against them;
//   gap 2 — facility topology: apply the canonical building (admin, idempotent),
//           read it back, and drive `flow.checkIn` + the WHOLE perioperative
//           admit→theatre→recovery→ward→discharge journey — including the
//           pharmacy-gated discharge — over HTTP on a fresh DB;
//   gap 3 — the fertility cycle engine: create (marriage gate proven), staff
//           consent recording + patient e-sign, the consent-gated advance, coded
//           cancel and convert, with the portal reads now drivable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WHO_REQUIRED_ITEMS } from "@oxford/perioperative";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string, ar = en) => ({ ar, en });

// ops-admin configures the clinic (admin:*); reception books but may NEVER
// re-configure it (scheduling:*); the consultant runs the clinical journey.
const ops: Session = {
  sessionId: "s-ops",
  subject: { staffId: "ops-1", roles: [{ id: "ops-admin", name: "ops-admin", permissions: ["admin:*"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};
const consultant: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*", "scheduling:*"] }] },
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

describe.skipIf(!DATABASE_URL)("Phase 7.3 router gaps 1–3 (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let opsApi: ReturnType<typeof appRouter.createCaller>;
  let deskApi: ReturnType<typeof appRouter.createCaller>;
  let docApi: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    // A FRESH clinic: no topology, no scheduling config, no reason codes — the
    // exact state of a newly-provisioned staging database.
    await pool.query(
      "TRUNCATE scheduling.resource, scheduling.appointment_type, scheduling.appointment, facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, perioperative.observation, perioperative.follow_up, pharmacy.prescription, fertility.cycle, fertility.cancellation_reason, fertility.stim_day, registry.person, registry.couple, registry.marriage_verification, audit.audit_log",
    );
    services = buildServices(pool);
    opsApi = appRouter.createCaller({ session: ops, patient: null, services });
    deskApi = appRouter.createCaller({ session: reception, patient: null, services });
    docApi = appRouter.createCaller({ session: consultant, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  // ── gap 1 — scheduling config ──────────────────────────────────────────────
  describe("gap 1 — scheduling config surface", () => {
    it("DENIES config mutations to reception (RBAC), lets an admin define types/resources, and the front desk books against them", async () => {
      // RBAC: booking staff may not re-configure the clinic.
      await expectCode(
        () => deskApi.scheduling.defineAppointmentType({ id: "type-monitoring", name: N("Monitoring scan", "أشعة متابعة"), durationMin: 30, requiredResourceKinds: ["practitioner"] }),
        "FORBIDDEN",
      );
      await expectCode(() => deskApi.scheduling.defineResource({ id: "res-doc-1", kind: "practitioner", name: N("Dr A", "د. أ") }), "FORBIDDEN");
      expect((await deskApi.scheduling.appointmentTypes()).types).toHaveLength(0);

      // Admin defines the minimum config a booking needs.
      const type = await opsApi.scheduling.defineAppointmentType({
        id: "type-monitoring",
        name: N("Monitoring scan", "أشعة متابعة"),
        durationMin: 30,
        requiredResourceKinds: ["practitioner", "scanner"],
        prep: N("Attend with a full bladder", "احضري والمثانة ممتلئة"),
      });
      expect(type.typeId).toBe("type-monitoring");
      const prac = await opsApi.scheduling.defineResource({ id: "res-doc-1", kind: "practitioner", name: N("Dr A", "د. أ"), level: "L3" });
      await opsApi.scheduling.defineResource({ id: "res-scan-1", kind: "scanner", name: N("Ultrasound 1", "جهاز الأشعة 1"), level: "L3" });

      // The booking UI's reads (front desk permission), bilingual config.
      const types = (await deskApi.scheduling.appointmentTypes()).types;
      expect(types).toHaveLength(1);
      expect(types[0]).toMatchObject({ id: "type-monitoring", durationMin: 30 });
      expect(types[0]?.name.ar).toBe("أشعة متابعة");
      expect((await deskApi.scheduling.resources()).resources.map((r) => r.id).sort()).toEqual(["res-doc-1", "res-scan-1"]);

      // Re-applying the same config is an idempotent upsert, not a duplicate.
      await opsApi.scheduling.defineAppointmentType({ id: "type-monitoring", name: N("Monitoring scan", "أشعة متابعة"), durationMin: 45, requiredResourceKinds: ["practitioner"] });
      const after = (await deskApi.scheduling.appointmentTypes()).types;
      expect(after).toHaveLength(1);
      expect(after[0]?.durationMin).toBe(45);

      // …and the defined config is immediately bookable.
      const patient = await docApi.registry.registerPerson({ name: N("Noura", "نورة"), civilId: "288050173001", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
      const appt = await deskApi.scheduling.book({
        patientId: patient.personId,
        typeId: type.typeId,
        practitionerId: prac.resourceId,
        resourceIds: ["res-scan-1"],
        start: "2026-09-01T08:00:00.000Z",
        end: "2026-09-01T08:30:00.000Z",
      });
      expect(appt.appointmentId.length).toBeGreaterThan(0);

      // Invalid config is rejected cleanly (validated in the service).
      await expectCode(() => opsApi.scheduling.defineAppointmentType({ name: N("Bad"), durationMin: 0, requiredResourceKinds: [] }), "BAD_REQUEST");
      await expectCode(() => opsApi.scheduling.defineResource({ kind: "practitioner", name: { ar: "", en: "No Arabic" } }), "BAD_REQUEST");

      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });
  });

  // ── gap 2 — facility topology ──────────────────────────────────────────────
  describe("gap 2 — facility topology seed/read", () => {
    it("DENIES topology writes to reception, applies the canonical building idempotently, and unblocks flow.checkIn", async () => {
      await expectCode(() => deskApi.facility.applyTopology({}), "FORBIDDEN");
      expect((await deskApi.facility.locations()).locations).toHaveLength(0);

      const applied = await opsApi.facility.applyTopology({});
      expect(applied.created).toEqual({ floors: 4, locations: 19, beds: 9 });
      expect(applied.totals).toEqual({ floors: 4, locations: 19, beds: 9 });

      const locations = (await deskApi.facility.locations()).locations;
      expect(locations.filter((l) => l.type === "theatre")).toHaveLength(2);
      expect(locations.filter((l) => l.type === "recovery_bed")).toHaveLength(3);
      expect(locations.filter((l) => l.type === "inpatient_bed")).toHaveLength(6);
      const beds = (await deskApi.facility.beds()).beds;
      expect(beds).toHaveLength(9);
      expect(beds.every((b) => b.status === "free")).toBe(true);

      // Idempotent: a second apply creates nothing and duplicates nothing.
      expect((await opsApi.facility.applyTopology({})).created).toEqual({ floors: 0, locations: 0, beds: 0 });
      expect((await deskApi.facility.locations()).locations).toHaveLength(19);

      // flow.checkIn — previously blocked on a fresh DB for want of a location.
      await opsApi.scheduling.defineAppointmentType({ id: "type-consult", name: N("Consultation", "استشارة"), durationMin: 30, requiredResourceKinds: ["practitioner"] });
      await opsApi.scheduling.defineResource({ id: "res-doc-1", kind: "practitioner", name: N("Dr A", "د. أ") });
      const patient = await docApi.registry.registerPerson({ name: N("Noura", "نورة"), civilId: "288050173002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
      const appt = await deskApi.scheduling.book({ patientId: patient.personId, typeId: "type-consult", practitionerId: "res-doc-1", resourceIds: [], start: "2026-09-01T09:00:00.000Z", end: "2026-09-01T09:30:00.000Z" });
      const waiting = locations.find((l) => l.type === "consult_room")!;
      expect(await deskApi.flow.checkIn({ appointmentId: appt.appointmentId, patientId: patient.personId, locationNodeId: waiting.locationNodeId })).toEqual({ checkedIn: true });

      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });

    it("drives the WHOLE perioperative journey (admit → theatre → recovery → ward → pharmacy-gated discharge) over HTTP on a fresh DB", async () => {
      await opsApi.facility.applyTopology({});
      const p = await docApi.registry.registerPerson({ name: N("Noura", "نورة"), civilId: "288050173003", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
      const patientId = p.personId;

      const { encounterId, stage } = await docApi.perioperative.admit({ patientId, indication: "oocyte retrieval", admittedAt: "2026-09-05T07:00:00.000Z" });
      expect(stage).toBe("admitted");
      await docApi.perioperative.advance({ encounterId, toStage: "ward_bed" });
      await docApi.perioperative.advance({ encounterId, toStage: "pre_theatre" });
      await docApi.perioperative.completeChecklistPhase({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "2026-09-05T07:30:00.000Z" });
      await docApi.perioperative.completeChecklistPhase({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "2026-09-05T07:40:00.000Z" });
      await docApi.perioperative.advance({ encounterId, toStage: "in_theatre" });
      await docApi.perioperative.completeChecklistPhase({ encounterId, phase: "sign_out", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_out], completedAt: "2026-09-05T08:30:00.000Z" });
      await docApi.perioperative.advance({ encounterId, toStage: "recovery" });
      await docApi.perioperative.recordObservation({ encounterId, phase: "recovery", aldreteScore: 10, systolicBp: 118, heartRate: 70, spo2: 99, recordedAt: "2026-09-05T09:00:00.000Z" });
      await docApi.perioperative.advance({ encounterId, toStage: "post_op_ward" });

      // both L1 (recovery) and L2 (ward) beds were allocated through the topology
      const board = await services.flow.board();
      expect(board.capacity.find((c) => c.level === "L2")!.occupied).toBe(1);

      // The pharmacy gate BLOCKS discharge until the external pharmacy confirms
      // handover of the discharge script (no dev stub — the real ADR-0069 loop).
      await expectCode(() => docApi.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");
      const rx = await docApi.pharmacy.raisePrescription({ patientId, encounterId, items: [{ drugId: "progesterone", quantity: 1, doseInstruction: N("400 mg twice daily", "400 ملغ مرتين يومياً") }] });
      await docApi.pharmacy.issue({ prescriptionId: rx.prescriptionId });
      await docApi.pharmacy.recordExternalFulfilment({ prescriptionId: rx.prescriptionId, externalRef: "GRD-1" });
      // still blocked — no follow-up booked yet
      await expectCode(() => docApi.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

      await docApi.perioperative.bookFollowUp({ encounterId, scheduledFor: "2026-09-19T09:00:00.000Z", bookedAt: "2026-09-05T10:00:00.000Z" });
      expect((await docApi.perioperative.advance({ encounterId, toStage: "discharged" })).stage).toBe("discharged");

      // the ward bed is released, and housekeeping returns it to the pool over HTTP
      expect((await services.flow.board()).capacity.find((c) => c.level === "L2")!.occupied).toBe(0);
      const dirty = (await deskApi.flow.bedsAwaitingTurnaround()).beds;
      expect(dirty.length).toBeGreaterThan(0);
      for (const b of dirty) expect((await deskApi.flow.completeTurnaround({ bedId: b.bedId })).status).toBe("free");
      expect((await deskApi.facility.beds()).beds.every((b) => b.status === "free")).toBe(true);

      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });
  });

  // ── gap 3 — fertility cycle engine ─────────────────────────────────────────
  describe("gap 3 — fertility cycle engine surface", () => {
    /** A registered couple; `verified` drives the marriage hard-gate. */
    async function couple(seq: string, verified: boolean): Promise<{ coupleId: string; wifeId: string }> {
      const husband = await docApi.registry.registerPerson({ name: N("Ali", "علي"), civilId: `284010173${seq}`, dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
      const wife = await docApi.registry.registerPerson({ name: N("Noura", "نورة"), civilId: `288050173${seq}`, dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
      const c = await docApi.registry.createCouple({ husbandPersonId: husband.personId, wifePersonId: wife.personId });
      if (verified) await docApi.registry.verifyMarriage({ coupleId: c.coupleId, documentRef: `m-${seq}`, method: "certificate" });
      return { coupleId: c.coupleId, wifeId: wife.personId };
    }

    it("REJECTS a cycle for an unverified couple, then runs create → consents → portal reads → coded cancel over HTTP", async () => {
      // THE MARRIAGE HARD-GATE, over HTTP: no verified marriage, no cycle.
      const unverified = await couple("901", false);
      await expectCode(() => docApi.fertility.createCycle({ type: "icsi", coupleId: unverified.coupleId }), "PRECONDITION_FAILED");
      expect(await services.cycle.cohort({})).toHaveLength(0);

      const { coupleId, wifeId } = await couple("902", true);
      const created = await docApi.fertility.createCycle({ type: "icsi", coupleId, protocolId: "antagonist" });
      expect(created.status).toBe("planned");
      expect([...created.outstandingConsents].sort()).toEqual(["consent.anaesthesia", "consent.data_processing", "consent.icsi"]);
      const cycleId = created.cycleId;

      // the consent gate blocks progression while consents are outstanding
      await expectCode(() => docApi.fertility.advanceCycle({ cycleId, toStatus: "stimulating" }), "PRECONDITION_FAILED");

      // staff-side recording (witnessed paper consent) + the patient's own e-sign
      const staffSigned = await docApi.fertility.recordConsent({ cycleId, consentKey: "consent.icsi" });
      expect(staffSigned.outstanding).not.toContain("consent.icsi");

      const portal = appRouter.createCaller({ session: null, patient: { patientId: wifeId }, services });
      expect([...(await portal.portal.outstandingConsents({ patientId: wifeId, cycleId })).outstanding].sort()).toEqual(["consent.anaesthesia", "consent.data_processing"]);
      await portal.portal.signConsent({ patientId: wifeId, cycleId, consentKey: "consent.anaesthesia" });
      const last = await portal.portal.signConsent({ patientId: wifeId, cycleId, consentKey: "consent.data_processing" });
      expect(last.outstanding).toEqual([]);

      // consents complete → the cycle advances; the portal timeline follows it
      expect((await docApi.fertility.advanceCycle({ cycleId, toStatus: "stimulating" })).status).toBe("stimulating");
      const timeline = (await portal.portal.cycleTimeline({ patientId: wifeId, cycleId })).timeline;
      expect(timeline.current).toBe("stimulating");
      expect(timeline.next).toBe("triggered");
      expect(timeline.steps.find((s) => s.status === "stimulating")?.state).toBe("current");

      // the medication schedule is now reachable for this cycle (the stimulation
      // chart itself has no HTTP surface yet — router gap 4 — so the day is
      // charted through the service the router will expose next).
      await services.stim.recordDay("doc-1", cycleId, { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU", route: "subcutaneous" }] });
      const schedule = (await portal.portal.medicationSchedule({ patientId: wifeId, cycleId })).schedule;
      expect(schedule).toHaveLength(1);
      expect(schedule[0]?.drugs[0]).toMatchObject({ formularyItemId: "rfsh", dose: 225, teachingVideoRef: "video:injection/rfsh" });

      // CODED cancellation: free text is rejected, and the reason config is
      // admin-owned (a clinician may cancel, never invent a reason code).
      await expectCode(() => docApi.fertility.cancelCycle({ cycleId, reasonCode: "she changed her mind" }), "BAD_REQUEST");
      await expectCode(
        () => docApi.fertility.defineCancellationReason({ code: "ohss_risk", category: "ohss_risk", name: N("OHSS risk", "خطر فرط التنبيه"), active: true }),
        "FORBIDDEN",
      );
      await opsApi.fertility.defineCancellationReason({ code: "ohss_risk", category: "ohss_risk", name: N("OHSS risk", "خطر فرط التنبيه"), active: true });
      expect((await docApi.fertility.cancellationReasons()).reasons.map((r) => r.code)).toEqual(["ohss_risk"]);

      const cancelled = await docApi.fertility.cancelCycle({ cycleId, reasonCode: "ohss_risk", note: "E2 rising steeply" });
      expect(cancelled).toMatchObject({ status: "cancelled", reasonCode: "ohss_risk", category: "ohss_risk" });
      expect((await docApi.fertility.cycle({ cycleId })).cycle.cancellationNote).toBe("E2 rising steeply");

      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });

    it("converts a cycle (IVF→IUI) into a NEW linked cycle with a conversion-category reason", async () => {
      const { coupleId } = await couple("903", true);
      await opsApi.fertility.defineCancellationReason({ code: "converted_to_iui", category: "converted", name: N("Converted to IUI", "تحويل إلى تلقيح داخل الرحم"), active: true });
      await opsApi.fertility.defineCancellationReason({ code: "poor_ovarian_response", category: "poor_response", name: N("Poor ovarian response", "استجابة مبيضية ضعيفة"), active: true });

      const ivf = await docApi.fertility.createCycle({ type: "ivf", coupleId });
      for (const key of ivf.outstandingConsents) await docApi.fertility.recordConsent({ cycleId: ivf.cycleId, consentKey: key });
      await docApi.fertility.advanceCycle({ cycleId: ivf.cycleId, toStatus: "stimulating" });

      // a conversion must use a `converted`-category reason…
      await expectCode(() => docApi.fertility.convertCycle({ cycleId: ivf.cycleId, toType: "iui", reasonCode: "poor_ovarian_response" }), "BAD_REQUEST");
      // …and a conversion reason may not be used for a plain cancel
      await expectCode(() => docApi.fertility.cancelCycle({ cycleId: ivf.cycleId, reasonCode: "converted_to_iui" }), "BAD_REQUEST");

      const conv = await docApi.fertility.convertCycle({ cycleId: ivf.cycleId, toType: "iui", reasonCode: "converted_to_iui", note: "poor response on day 6" });
      expect(conv.sourceStatus).toBe("cancelled");
      expect(conv.type).toBe("iui");
      expect(conv.convertedFromId).toBe(ivf.cycleId);

      // the new cycle carries the signed consents across and is readable over
      // HTTP; only the consents specific to the NEW type remain outstanding
      const reloaded = await docApi.fertility.cycle({ cycleId: conv.cycleId });
      expect(reloaded.cycle.status).toBe("planned");
      expect(reloaded.cycle.signedConsents).toContain("consent.data_processing");
      expect(reloaded.outstandingConsents).toEqual(["consent.iui"]);

      // KPI disposition separates the conversion from a true cancellation
      const counts = await services.cycle.dispositionCounts();
      expect(counts).toMatchObject({ started: 2, cancelled: 0, converted: 1 });

      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });

    it("creates a person-scoped preservation cycle with NO couple (ADR-0015) and rejects a treatment cycle with no couple", async () => {
      const person = await docApi.registry.registerPerson({ name: N("Sara", "سارة"), civilId: "292050173904", dob: "1992-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
      const preservation = await docApi.fertility.createCycle({ type: "fertility_preservation", personId: person.personId });
      expect(preservation.type).toBe("fertility_preservation");
      expect([...preservation.outstandingConsents].sort()).toEqual(["consent.data_processing", "consent.preservation", "consent.storage"]);
      await expectCode(() => docApi.fertility.createCycle({ type: "icsi" }), "BAD_REQUEST");
      expect((await services.audit.verifyIntegrity()).ok).toBe(true);
    });
  });
});
