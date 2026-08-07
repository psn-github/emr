// Synthetic-patient simulation journeys (staging/synthetic-data ONLY — the
// whole harness talks to the dev/staging HTTP host, which refuses production
// boot). Each "couple" drives a whole-EMR journey OVER REAL HTTP through the
// same tRPC surface the clinic will use: registration → verified marriage →
// a real treatment cycle (consents, consent-gated progression) → booking +
// front-desk check-in → clinical encounter/orders/results → the perioperative
// day case (WHO-gated theatre, pharmacy-gated discharge) → embryology with RI
// Witness reconciliation (the stub is fed via the `dev` router — never
// overridden) → outcomes → packages/instalments/KNET → the patient portal — and
// verifies the audit hash-chain every loop. A step failure NEVER stops the run:
// it is recorded in the report and the journey continues where sensible.
//
// The clinic CONFIGURATION the journeys need (facility topology, appointment
// types/resources, cancellation reason codes, charge codes, the package) is
// applied once per run through the admin surfaces, all of which are idempotent —
// re-running against a persistent staging database adds no configuration rows.
//
// Determinism: all VARIATION (couple variant, oocyte counts) comes from the
// seeded PRNG (prng.ts) — no Math.random. Identity strings additionally carry a
// per-run tag so repeated runs against a persistent staging database cannot
// collide on civil ids, storage positions or booked slots.
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { SEED_CANCELLATION_REASONS } from "@oxford/fertility";
import { WHO_REQUIRED_ITEMS } from "@oxford/perioperative";
import type { AppRouter } from "../router.js";
import { mulberry32, pickInt, type Rng } from "./prng.js";

export interface SimulationOptions {
  readonly url: string;
  readonly couples: number;
  readonly loops: number;
  readonly seed: number;
}

export interface SimulationFailure {
  readonly loop: number;
  readonly couple: number;
  readonly step: string;
  readonly procedure: string;
  readonly message: string;
  readonly code: string;
}

export interface SimulationReport {
  readonly url: string;
  readonly seed: number;
  readonly couples: number;
  readonly loops: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly stepsRun: number;
  readonly stepsPassed: number;
  readonly stepsFailed: number;
  readonly auditChainIntact: boolean;
  readonly errors: readonly SimulationFailure[];
  /** Journey steps with NO API surface today — skipped by design (documented
   *  router gaps, not failures). Kept in the report so a run is honest about
   *  what it could not drive. */
  readonly routerGaps: readonly string[];
}

/** Target-journey steps the router exposes no procedure for (the phase e2es
 *  drive these through in-process services). The simulator skips them.
 *  Gaps 1–3 + 7 of docs/PHASE7_PLAN §7.3 are CLOSED — scheduling config, the
 *  facility topology, the cycle engine and the perioperative admission path are
 *  all driven over HTTP below. */
export const ROUTER_GAPS: readonly string[] = [
  "stimulation: no stim.recordDay or formulary-config surface — stimulation days with formulary drugs cannot be recorded over HTTP (so the portal medication schedule reads empty)",
  "embryology: no recordOocyte / recordFertilisationCheck / recordGrading surface — retrieval and fert-check are represented by synthetic ids around recordInsemination/recordTransfer",
  "witnessing: no ingest/reconciliation read surface (sign-off reconciles live against the provider, so dev.seedWitnessRecord suffices)",
];

type Api = ReturnType<typeof apiClient>;

function apiClient(url: string, bearer: string) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${url}/trpc`, headers: { authorization: `Bearer ${bearer}` } })],
  });
}

const staffToken = (sub: string): string => `dev:${JSON.stringify({ sub, amr: ["pwd", "mfa"] })}`;

/** Bilingual test text (same convention as the phase e2es' N()). */
const N = (en: string): { ar: string; en: string } => ({ ar: en, en });

function errorCode(e: unknown): string {
  if (e instanceof TRPCClientError) {
    const data = e.data as { code?: string } | undefined;
    return data?.code ?? "TRPC_ERROR";
  }
  return "SIM_ASSERT";
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

interface StepAt {
  readonly loop: number;
  readonly couple: number;
}

/** Records every step; a failure is captured (never thrown) so the run goes on. */
class Journal {
  readonly errors: SimulationFailure[] = [];
  stepsRun = 0;
  stepsPassed = 0;

  async step<T>(at: StepAt, step: string, procedure: string, fn: () => Promise<T>): Promise<T | undefined> {
    this.stepsRun += 1;
    try {
      const value = await fn();
      this.stepsPassed += 1;
      return value;
    } catch (e) {
      this.errors.push({ loop: at.loop, couple: at.couple, step, procedure, message: errorMessage(e), code: errorCode(e) });
      return undefined;
    }
  }
}

interface Env {
  readonly doc: Api; // dev-consultant: clinical:* + scheduling:*
  readonly emb: Api; // dev-embryologist: embryology:*
  readonly fin: Api; // dev-finance: financial:*
  readonly phm: Api; // dev-pharmacist: clinical:dispense.*
  readonly ops: Api; // dev-ops: admin:* (seeds pharmacy stock)
  readonly patient: (personId: string) => Api; // devpatient principal
  readonly j: Journal;
  readonly runTag: string;
}

const SCAN_CODE = "SIM-SCAN";
const CONSULT_CODE = "SIM-CONSULT";
const PACKAGE_CODE = "SIM-ICSI-PKG";
const PACKAGE_PRICE_FILS = 1_500_000;

// Stable configuration keys (config-as-data): re-applying them is an idempotent
// upsert, so a re-run against a persistent staging DB adds no config rows.
const MONITORING_TYPE_ID = "sim-type-monitoring";
const THEATRE_TYPE_ID = "sim-type-theatre";
const SCANNER_RESOURCE_ID = "sim-res-scanner-1";

interface SimPackage {
  readonly packageId: string;
  readonly priceFils: number;
}

/** Clinic configuration the journeys need, resolved once per run. */
interface ClinicConfig {
  readonly pkg: SimPackage | undefined;
  /** An L3 consult room the front desk checks patients in to. */
  readonly waitingLocationNodeId: string | undefined;
}

/** Config-as-data setup, tolerant of re-runs against a persistent staging DB:
 *  charge codes upsert; the package is find-by-code-or-define; the facility
 *  topology, scheduling config and cancellation-reason codes are applied through
 *  the Phase-7.3 admin surfaces, all of which are idempotent. */
async function ensureConfig(env: Env, at: StepAt): Promise<ClinicConfig> {
  const { doc, fin, ops, j } = env;

  // ── the building (gap 2): idempotent apply of the canonical Oxford topology
  await j.step(at, "config: facility topology", "facility.applyTopology", async () => {
    const r = await ops.facility.applyTopology.mutate({});
    ensure(r.totals.beds === 9 && r.totals.locations === 19, `expected the canonical topology (19 locations, 9 beds), got ${r.totals.locations}/${r.totals.beds}`);
  });
  const waitingLocationNodeId = await j.step(at, "config: read topology for check-in", "facility.locations", async () => {
    const consult = (await doc.facility.locations.query()).locations.find((l) => l.type === "consult_room");
    ensure(consult !== undefined, "expected an L3 consult room in the topology");
    return consult!.locationNodeId;
  });

  // ── scheduling config (gap 1): appointment types + the shared scanner room
  await j.step(at, "config: appointment types + resources", "scheduling.defineAppointmentType", async () => {
    await ops.scheduling.defineAppointmentType.mutate({ id: MONITORING_TYPE_ID, name: N("Monitoring scan (simulator)"), durationMin: 30, requiredResourceKinds: ["practitioner"], prep: N("Attend with a full bladder") });
    await ops.scheduling.defineAppointmentType.mutate({ id: THEATRE_TYPE_ID, name: N("Theatre case (simulator)"), durationMin: 60, requiredResourceKinds: ["theatre", "practitioner"] });
    await ops.scheduling.defineResource.mutate({ id: SCANNER_RESOURCE_ID, kind: "scanner", name: N("Ultrasound room (simulator)"), level: "L3" });
    const types = (await doc.scheduling.appointmentTypes.query()).types;
    ensure(types.some((t) => t.id === MONITORING_TYPE_ID), "expected the monitoring appointment type to be listed");
  });

  // ── coded cancellation/conversion reasons (gap 3): versioned config
  await j.step(at, "config: cancellation reason codes", "fertility.defineCancellationReason", async () => {
    for (const reason of SEED_CANCELLATION_REASONS) await ops.fertility.defineCancellationReason.mutate(reason);
    const active = (await doc.fertility.cancellationReasons.query()).reasons;
    ensure(active.length >= SEED_CANCELLATION_REASONS.length, `expected the seeded reason codes to be active, got ${active.length}`);
  });

  await j.step(at, "config: charge code SIM-SCAN", "charges.defineCode", () =>
    fin.charges.defineCode.mutate({ code: SCAN_CODE, description: N("Monitoring scan (simulator)"), unitAmountFils: 15_000 }),
  );
  await j.step(at, "config: charge code SIM-CONSULT", "charges.defineCode", () =>
    fin.charges.defineCode.mutate({ code: CONSULT_CODE, description: N("Consultation (simulator)"), unitAmountFils: 25_000 }),
  );
  const pkg = await j.step(at, "config: ICSI package", "packages.define", async () => {
    const existing = (await fin.packages.list.query()).packages.find((p) => p.code === PACKAGE_CODE && p.active);
    if (existing !== undefined) return { packageId: existing.id, priceFils: existing.priceFils };
    const defined = await fin.packages.define.mutate({
      code: PACKAGE_CODE,
      name: N("ICSI Package (simulator)"),
      priceFils: PACKAGE_PRICE_FILS,
      components: [{ chargeCode: SCAN_CODE, description: N("Monitoring scan (simulator)"), includedQuantity: 4, unitAmountFils: 15_000 }],
    });
    return { packageId: defined.packageId, priceFils: PACKAGE_PRICE_FILS };
  });
  return { pkg, waitingLocationNodeId };
}

type Variant = "transfer" | "freeze" | "cancel";

interface CouplePlan {
  readonly variant: Variant;
  readonly oocytes: number;
  /** At least one couple per loop exercises the portal partner-access grant. */
  readonly partnerAccess: boolean;
}

/** Draw the couple's journey plan from the seeded PRNG (fixed draw order keeps
 *  a seed fully deterministic). ~1 in 3 couples cancel instead of transferring. */
function planCouple(rng: Rng, couple: number): CouplePlan {
  const oocytes = pickInt(rng, 2, 4);
  const draw = rng();
  const variant: Variant = draw < 1 / 3 ? "cancel" : draw < 2 / 3 ? "transfer" : "freeze";
  return { variant, oocytes, partnerAccess: couple === 0 };
}

async function runCoupleJourney(env: Env, at: StepAt, plan: CouplePlan, config: ClinicConfig): Promise<void> {
  const { doc, emb, fin, phm, ops, j, runTag } = env;
  const pkg = config.pkg;
  const tag = `${runTag}-${at.loop}-${at.couple}`;
  const T0 = "2026-09-01T08:00:00.000Z";
  // Captured for the print pack (ADR-0068) at the end of the journey.
  let printableInvoiceId: string | undefined;
  let printablePrescriptionId: string | undefined;

  // ── registration + verified marriage (the identity hard-gate) ─────────────
  const wife = await j.step(at, "register wife", "registry.registerPerson", () =>
    doc.registry.registerPerson.mutate({
      name: { en: `Sim Wife ${tag}`, ar: `زوجة تجريبية ${tag}` },
      civilId: `SIMW-${tag}`,
      dob: "1990-05-01",
      sex: "female",
      nationality: "KW",
      languagePref: "ar",
    }),
  );
  const husband = await j.step(at, "register husband", "registry.registerPerson", () =>
    doc.registry.registerPerson.mutate({
      name: { en: `Sim Husband ${tag}`, ar: `زوج تجريبي ${tag}` },
      civilId: `SIMH-${tag}`,
      dob: "1986-02-01",
      sex: "male",
      nationality: "KW",
      languagePref: "ar",
    }),
  );
  if (wife === undefined || husband === undefined) return;
  const wifeId = wife.personId;
  const husbandId = husband.personId;

  // ── paper file: allocate the MRN, open the physical file, and move it ──────
  // (records domain, MFA-gated; the dev-consultant token carries clinical:*).
  await j.step(at, "records: MRN + file + movement", "records.assignMrn", async () => {
    const mrn = await doc.records.assignMrn.mutate({ personId: wifeId });
    ensure(mrn.mrn.length > 0, "expected an allocated MRN");
    const file = await doc.records.openFile.mutate({ personId: wifeId, homeLocation: "Records/A-1" });
    await doc.records.checkOut.mutate({ fileId: file.fileId, toLocation: "L3/Consult-1", toStaffId: "nurse-1" });
    await doc.records.checkIn.mutate({ fileId: file.fileId });
  });

  const couple = await j.step(at, "create couple", "registry.createCouple", () =>
    doc.registry.createCouple.mutate({ husbandPersonId: husbandId, wifePersonId: wifeId }),
  );
  if (couple === undefined) return;
  await j.step(at, "verify marriage", "registry.verifyMarriage", async () => {
    const r = await doc.registry.verifyMarriage.mutate({ coupleId: couple.coupleId, documentRef: `sim-marriage-${tag}`, method: "certificate" });
    ensure(r.status === "verified", `expected verified marriage, got ${r.status}`);
  });
  await j.step(at, "fertility intake gate", "fertility.startIntake", () => doc.fertility.startIntake.mutate({ coupleId: couple.coupleId }));

  // ── the treatment cycle (gap 3) ───────────────────────────────────────────
  // A REAL cycle row: the marriage gate above is what let it be created, and the
  // whole lab/portal journey below is keyed by its id. Consents are recorded on
  // both sides — one by the clinician, the rest e-signed by the patient — and
  // the cycle cannot leave `planned` until they are complete (service gate).
  const wifePortal = env.patient(wifeId);
  const cycle = await j.step(at, "create treatment cycle (marriage-gated)", "fertility.createCycle", async () => {
    const c = await doc.fertility.createCycle.mutate({ type: "icsi", coupleId: couple.coupleId, protocolId: "antagonist" });
    ensure(c.status === "planned", `expected a planned cycle, got ${c.status}`);
    ensure(c.outstandingConsents.length > 0, "expected outstanding consents on a new cycle");
    return c;
  });
  if (cycle === undefined) return;
  const cycleId = cycle.cycleId;

  await j.step(at, "cycle consents: staff records one, patient e-signs the rest", "fertility.recordConsent", async () => {
    const first = cycle.outstandingConsents[0]!;
    await doc.fertility.recordConsent.mutate({ cycleId, consentKey: first });
    const outstanding = await wifePortal.portal.outstandingConsents.query({ patientId: wifeId, cycleId });
    for (const key of outstanding.outstanding) await wifePortal.portal.signConsent.mutate({ patientId: wifeId, cycleId, consentKey: key });
    const after = await wifePortal.portal.outstandingConsents.query({ patientId: wifeId, cycleId });
    ensure(after.outstanding.length === 0, `expected no outstanding consents, got ${after.outstanding.length}`);
  });
  await j.step(at, "cycle advances to stimulating (consent gate satisfied)", "fertility.advanceCycle", async () => {
    const r = await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: "stimulating" });
    ensure(r.status === "stimulating", `expected a stimulating cycle, got ${r.status}`);
  });
  await j.step(at, "portal: cycle timeline + medication schedule", "portal.cycleTimeline", async () => {
    const t = await wifePortal.portal.cycleTimeline.query({ patientId: wifeId, cycleId });
    ensure(t.timeline.current === "stimulating", `expected the timeline at stimulating, got ${t.timeline.current}`);
    // The chart itself has no HTTP surface yet (router gap 4), so the schedule
    // is legitimately empty — what matters is that it is now REACHABLE.
    const meds = await wifePortal.portal.medicationSchedule.query({ patientId: wifeId, cycleId });
    ensure(Array.isArray(meds.schedule), "expected a medication schedule for an owned cycle");
  });

  // ── scheduling against REAL config + front-desk check-in (gaps 1 + 2) ─────
  // The practitioner resource is defined per couple/run so slots never collide
  // across loops or re-runs; the appointment type is the shared clinic config.
  const practitionerId = `sim-res-doc-${tag}`;
  const appointment = await j.step(at, "define practitioner + book monitoring appointment", "scheduling.book", async () => {
    await ops.scheduling.defineResource.mutate({ id: practitionerId, kind: "practitioner", name: N(`Sim Consultant ${tag}`), level: "L3" });
    return doc.scheduling.book.mutate({
      patientId: wifeId,
      typeId: MONITORING_TYPE_ID,
      practitionerId,
      resourceIds: [],
      start: T0,
      end: "2026-09-01T08:30:00.000Z",
    });
  });
  if (appointment !== undefined && config.waitingLocationNodeId !== undefined) {
    const locationNodeId = config.waitingLocationNodeId;
    await j.step(at, "front desk: check the patient in", "flow.checkIn", () =>
      doc.flow.checkIn.mutate({ appointmentId: appointment.appointmentId, patientId: wifeId, locationNodeId }),
    );
  }

  // ── clinical encounter → note → order → result → release ─────────────────
  const enc = await j.step(at, "open encounter", "clinical.openEncounter", () =>
    doc.clinical.openEncounter.mutate({ patientId: wifeId, type: "new_fertility", practitionerId: "doc-1" }),
  );
  if (enc !== undefined) {
    await j.step(at, "write note", "clinical.writeNote", () =>
      doc.clinical.writeNote.mutate({ encounterId: enc.encounterId, patientId: wifeId, body: { subjective: "sim: baseline fertility visit", plan: "sim: AMH + ICSI workup" } }),
    );
    const order = await j.step(at, "place lab order", "clinical.placeOrder", () =>
      doc.clinical.placeOrder.mutate({ encounterId: enc.encounterId, patientId: wifeId, kind: "lab", code: "AMH" }),
    );
    if (order !== undefined) {
      const result = await j.step(at, "file result", "clinical.fileResult", () =>
        doc.clinical.fileResult.mutate({ orderId: order.orderId, summary: "AMH 1.2 ng/mL", abnormal: false }),
      );
      if (result !== undefined) {
        await j.step(at, "release result to portal", "clinical.releaseResult", () => doc.clinical.releaseResult.mutate({ resultId: result.resultId }));
      }
    }
    // Exercises the dev pharmacy stub feed (the real fulfilment loop below is
    // what actually gates the perioperative discharge).
    await j.step(at, "mark pharmacy fulfilled (dev stub)", "dev.markPharmacyFulfilled", () => doc.dev.markPharmacyFulfilled.mutate({ encounterId: enc.encounterId }));

    // External-pharmacy prescription loop (ADR-0069): the clinician raises a
    // FORMULARY-ONLY discharge script for the encounter; ward/reception staff issue
    // it (printed) and then record the EXTERNAL pharmacy's fulfilment. NO clinic
    // stock moves on this path. Idempotent: no stock writes at all.
    const rxId = await j.step(at, "pharmacy: raise → issue → external fulfilment", "pharmacy.raisePrescription", async () => {
      const rx = await doc.pharmacy.raisePrescription.mutate({
        patientId: wifeId,
        encounterId: enc.encounterId,
        items: [{ drugId: "rfsh", quantity: 2, doseInstruction: { en: "225 IU daily", ar: "225 وحدة يومياً" } }],
      });
      await phm.pharmacy.issue.mutate({ prescriptionId: rx.prescriptionId });
      const fulfilled = await phm.pharmacy.recordExternalFulfilment.mutate({ prescriptionId: rx.prescriptionId, externalRef: `GRD-${tag}` });
      ensure(fulfilled.status === "fulfilled", `expected the script to be fulfilled, got ${fulfilled.status}`);
      return rx.prescriptionId;
    });
    if (rxId !== undefined) printablePrescriptionId = rxId;

    // In-house theatre drug administration (ADR-0069): the clinic's OWN stock — an
    // anaesthetic drawn in theatre decrements theatre stock (FEFO). Seed theatre
    // stock first via the inventory router. Config-style + idempotent: the stock
    // receipt is additive (top-up each loop), so a re-run against a persistent DB
    // always has enough to administer.
    await j.step(at, "pharmacy: administer theatre drugs (in-house stock)", "pharmacy.administerTheatreDrugs", async () => {
      await ops.inventory.receiveStock.mutate({ itemId: "propofol", lotNo: `SIM-PROP-${tag}`, locationId: "theatre-l1", quantity: 10, expiryDate: "2028-01-01", receivedAt: T0 });
      const admin = await phm.pharmacy.administerTheatreDrugs.mutate({
        encounterId: enc.encounterId,
        patientId: wifeId,
        drugs: [{ drugId: "propofol", quantity: 2 }],
      });
      ensure(admin.allocations.length > 0, "expected theatre stock to be allocated FEFO");
    });
  }

  // ── andrology (husband) ───────────────────────────────────────────────────
  await j.step(at, "record semen analysis", "andrology.recordSemenAnalysis", () =>
    emb.andrology.recordSemenAnalysis.mutate({
      patientId: husbandId,
      collectedAt: T0,
      parameters: {
        volumeMl: 2.0,
        concentrationMillionPerMl: 40,
        totalCountMillion: 80,
        progressiveMotilityPct: 35,
        totalMotilityPct: 45,
        normalMorphologyPct: 5,
        vitalityPct: 60,
      },
    }),
  );

  // ── perioperative day case: retrieval under GA (gaps 2 + 7) ───────────────
  // Drivable end-to-end now that the topology exists: admit on L3 → L2 bed → L1
  // pre-op → theatre (WHO-gated) → recovery → L2 → PHARMACY-GATED discharge, with
  // housekeeping returning the vacated beds to the pool so re-runs stay clean.
  const surgical = await j.step(at, "perioperative: admit → theatre → recovery → ward", "perioperative.admit", async () => {
    const admitted = await doc.perioperative.admit.mutate({ patientId: wifeId, indication: "Oocyte retrieval (simulated)", admittedAt: "2026-09-05T07:00:00.000Z" });
    ensure(admitted.stage === "admitted", `expected an admitted encounter, got ${admitted.stage}`);
    const encounterId = admitted.encounterId;
    await doc.perioperative.advance.mutate({ encounterId, toStage: "ward_bed" });
    await doc.perioperative.advance.mutate({ encounterId, toStage: "pre_theatre" });
    await doc.perioperative.completeChecklistPhase.mutate({ encounterId, phase: "sign_in", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_in], completedAt: "2026-09-05T07:30:00.000Z" });
    await doc.perioperative.completeChecklistPhase.mutate({ encounterId, phase: "time_out", confirmedItems: [...WHO_REQUIRED_ITEMS.time_out], completedAt: "2026-09-05T07:40:00.000Z" });
    await doc.perioperative.advance.mutate({ encounterId, toStage: "in_theatre" });
    await doc.perioperative.completeChecklistPhase.mutate({ encounterId, phase: "sign_out", confirmedItems: [...WHO_REQUIRED_ITEMS.sign_out], completedAt: "2026-09-05T08:30:00.000Z" });
    await doc.perioperative.advance.mutate({ encounterId, toStage: "recovery" });
    await doc.perioperative.recordObservation.mutate({ encounterId, phase: "recovery", aldreteScore: 10, systolicBp: 118, heartRate: 72, spo2: 99, recordedAt: "2026-09-05T09:00:00.000Z" });
    const ward = await doc.perioperative.advance.mutate({ encounterId, toStage: "post_op_ward" });
    ensure(ward.stage === "post_op_ward", `expected the patient on the post-op ward, got ${ward.stage}`);
    return encounterId;
  });
  if (surgical !== undefined) {
    const encounterId = surgical;
    await j.step(at, "perioperative: pharmacy-gated discharge + bed turnaround", "perioperative.advance", async () => {
      const rx = await doc.pharmacy.raisePrescription.mutate({
        patientId: wifeId,
        encounterId,
        items: [{ drugId: "progesterone", quantity: 1, doseInstruction: { en: "400 mg twice daily", ar: "400 ملغ مرتين يومياً" } }],
      });
      await phm.pharmacy.issue.mutate({ prescriptionId: rx.prescriptionId });
      await phm.pharmacy.recordExternalFulfilment.mutate({ prescriptionId: rx.prescriptionId, externalRef: `GRD-OP-${tag}` });
      await doc.perioperative.bookFollowUp.mutate({ encounterId, scheduledFor: "2026-09-19T09:00:00.000Z", bookedAt: "2026-09-05T10:00:00.000Z" });
      const discharged = await doc.perioperative.advance.mutate({ encounterId, toStage: "discharged" });
      ensure(discharged.stage === "discharged", `expected a discharged encounter, got ${discharged.stage}`);
      // housekeeping: return every vacated bed to the pool (keeps re-runs clean)
      for (const bed of (await doc.flow.bedsAwaitingTurnaround.query()).beds) {
        await doc.flow.completeTurnaround.mutate({ bedId: bed.bedId });
      }
    });
  }

  // ── the cycle reaches retrieval, then embryology + RI Witness reconciliation ─
  // Every handling event gets a MATCHING RI record seeded into the stub (as the
  // device would have returned it) so cycle-step sign-off reconciles; seeding
  // happens strictly AFTER the Oxford event so an early record can never sit as
  // an orphan (orphans block sign-off — no override).
  if (plan.variant !== "cancel") {
    await j.step(at, "cycle: trigger → retrieval", "fertility.advanceCycle", async () => {
      await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: "triggered" });
      const r = await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: "retrieval" });
      ensure(r.status === "retrieval", `expected the cycle at retrieval, got ${r.status}`);
    });
  }
  for (let i = 0; i < plan.oocytes; i += 1) {
    const oocyteId = `sim-ooc-${tag}-${i}`;
    const insem = await j.step(at, `record insemination ${i + 1}/${plan.oocytes}`, "embryology.recordInsemination", () =>
      emb.embryology.recordInsemination.mutate({
        cycleId,
        oocyteId,
        method: "ICSI",
        spermSourceId: husbandId,
        operator: "emb-1",
        inseminatedAt: "2026-09-02T09:00:00.000Z",
        patientId: wifeId,
      }),
    );
    if (insem === undefined) continue;
    await j.step(at, `seed RI record for insemination ${i + 1}`, "dev.seedWitnessRecord", () =>
      doc.dev.seedWitnessRecord.mutate({
        cycleId,
        record: {
          riRecordId: `sim-ri-${tag}-ins-${i}`,
          oxfordKey: `${cycleId}:insemination:${oocyteId}`,
          patientId: wifeId,
          sampleId: oocyteId,
          outcome: "witnessed",
          witnessedAt: "2026-09-02T09:00:01.000Z",
        },
      }),
    );
  }
  await j.step(at, "lab KPIs read live", "analytics.cycleLabKpis", async () => {
    const kpis = await doc.analytics.cycleLabKpis.query({ cycleId });
    ensure(kpis.counts.inseminated === plan.oocytes, `expected ${plan.oocytes} inseminations, got ${kpis.counts.inseminated}`);
  });

  if (plan.variant === "transfer") {
    const embryoId = `sim-emb-${tag}-0`;
    const transfer = await j.step(at, "embryo transfer (witness-gated)", "embryology.recordTransfer", () =>
      emb.embryology.recordTransfer.mutate({
        cycleId,
        embryoIds: [embryoId],
        catheter: "soft",
        difficulty: "easy",
        ultrasoundGuided: true,
        operator: "emb-1",
        transferredAt: "2026-09-07T10:00:00.000Z",
        patientId: wifeId,
      }),
    );
    if (transfer !== undefined) {
      await j.step(at, "seed RI record for transfer", "dev.seedWitnessRecord", () =>
        doc.dev.seedWitnessRecord.mutate({
          cycleId,
          record: {
            riRecordId: `sim-ri-${tag}-tr`,
            oxfordKey: `${cycleId}:transfer:${transfer.transferId}`,
            patientId: wifeId,
            sampleId: transfer.transferId,
            outcome: "witnessed",
            witnessedAt: "2026-09-07T10:00:01.000Z",
          },
        }),
      );
    }
    // outcome continuum: positive β-hCG → clinical pregnancy → live birth
    await j.step(at, "record pregnancy test", "outcomes.recordTest", async () => {
      const r = await doc.outcomes.recordTest.mutate({ cycleId, betaHcgMiuMl: 210, testedAt: "2026-09-21T08:00:00.000Z" });
      ensure(r.result === "positive", `expected positive β-hCG classification, got ${r.result}`);
    });
    await j.step(at, "record clinical assessment", "outcomes.recordAssessment", () =>
      doc.outcomes.recordAssessment.mutate({ cycleId, gestationalSacs: 1, fetalHeartbeats: 1, assessedAt: "2026-10-12T08:00:00.000Z" }),
    );
    await j.step(at, "record live-birth outcome", "outcomes.recordOutcome", () =>
      doc.outcomes.recordOutcome.mutate({ cycleId, type: "live_birth", liveBirthCount: 1, gestationalAgeWeeks: 39, occurredAt: "2027-05-20T08:00:00.000Z" }),
    );
    await j.step(at, "outcome summary", "outcomes.summary", async () => {
      const s = await doc.outcomes.summary.query({ cycleId });
      ensure(s.kpi.liveBirth, "expected liveBirth KPI to be true");
    });
    await j.step(at, "cycle: fertilisation → transfer → luteal → outcome", "fertility.advanceCycle", async () => {
      for (const to of ["fertilisation", "culture", "transfer", "luteal", "outcome"] as const) {
        await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: to });
      }
      const t = await wifePortal.portal.cycleTimeline.query({ patientId: wifeId, cycleId });
      ensure(t.timeline.current === "outcome" && t.timeline.next === null, `expected the cycle completed at outcome, got ${t.timeline.current}`);
    });
  } else if (plan.variant === "freeze") {
    const embryoId = `sim-emb-${tag}-0`;
    const disposition = await j.step(at, "freeze disposition (witness-gated)", "embryology.recordDisposition", () =>
      emb.embryology.recordDisposition.mutate({ cycleId, embryoId, type: "freeze", occurredAt: "2026-09-07T10:00:00.000Z", operator: "emb-1", patientId: wifeId }),
    );
    if (disposition !== undefined) {
      await j.step(at, "seed RI record for freeze disposition", "dev.seedWitnessRecord", () =>
        doc.dev.seedWitnessRecord.mutate({
          cycleId,
          record: {
            riRecordId: `sim-ri-${tag}-fz`,
            oxfordKey: `${cycleId}:disposition.freeze:${embryoId}`,
            patientId: wifeId,
            sampleId: embryoId,
            outcome: "witnessed",
            witnessedAt: "2026-09-07T10:00:01.000Z",
          },
        }),
      );
      const specimen = await j.step(at, "freeze into cryostorage", "cryostore.freeze", () =>
        emb.cryostore.freeze.mutate({
          kind: "embryo",
          owner: { kind: "couple", id: couple.coupleId },
          cycleId,
          straws: 1,
          position: { tankId: "sim-tank-1", canister: "C1", cane: `cane-${tag}`, position: "1" },
          freezeEventRef: disposition.dispositionId,
          patientId: wifeId,
          occurredAt: "2026-09-07T10:05:00.000Z",
        }),
      );
      if (specimen !== undefined) {
        await j.step(at, "seed RI record for cryo custody", "dev.seedWitnessRecord", () =>
          doc.dev.seedWitnessRecord.mutate({
            cycleId,
            record: {
              riRecordId: `sim-ri-${tag}-cryo`,
              oxfordKey: `${cycleId}:cryo.freeze:${specimen.specimenId}`,
              patientId: wifeId,
              sampleId: specimen.specimenId,
              outcome: "witnessed",
              witnessedAt: "2026-09-07T10:05:01.000Z",
            },
          }),
        );
        await j.step(at, "record storage consent", "cryostore.recordConsent", () =>
          emb.cryostore.recordConsent.mutate({ specimenId: specimen.specimenId, consentedAt: "2026-09-07T10:10:00.000Z", storageYears: 5 }),
        );
      }
    }
    await j.step(at, "record pregnancy test (freeze-all)", "outcomes.recordTest", () =>
      doc.outcomes.recordTest.mutate({ cycleId, betaHcgMiuMl: 2, testedAt: "2026-09-21T08:00:00.000Z" }),
    );
    await j.step(at, "cycle: fertilisation → culture (freeze-all)", "fertility.advanceCycle", async () => {
      await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: "fertilisation" });
      const r = await doc.fertility.advanceCycle.mutate({ cycleId, toStatus: "culture" });
      ensure(r.status === "culture", `expected the cycle at culture, got ${r.status}`);
    });
  } else {
    // Coded cancellation: the CYCLE is cancelled with a reason code from the
    // versioned config (never free text), and the booked theatre case with it.
    const theatreCase = await j.step(at, "schedule retrieval theatre case", "perioperative.scheduleCase", () =>
      doc.perioperative.scheduleCase.mutate({
        typeId: THEATRE_TYPE_ID,
        patientId: wifeId,
        procedure: "Oocyte retrieval (simulated)",
        theatreResourceId: `sim-theatre-${tag}`,
        surgeonResourceId: `sim-surgeon-${tag}`,
        scheduledDate: "2026-09-05",
        start: "2026-09-05T08:00:00.000Z",
        end: "2026-09-05T09:00:00.000Z",
      }),
    );
    if (theatreCase !== undefined) {
      await j.step(at, "coded cancellation of the case", "perioperative.cancelCase", async () => {
        const r = await doc.perioperative.cancelCase.mutate({ caseId: theatreCase.caseId, reason: "sim.cancel.ohss_risk" });
        ensure(r.status === "cancelled", `expected cancelled case, got ${r.status}`);
      });
    }
    await j.step(at, "reason-coded cycle cancellation", "fertility.cancelCycle", async () => {
      // free text is REJECTED — only a configured code may cancel a cycle
      let rejected = false;
      try {
        await doc.fertility.cancelCycle.mutate({ cycleId, reasonCode: "she changed her mind" });
      } catch {
        rejected = true;
      }
      ensure(rejected, "expected a free-text cancellation reason to be rejected");
      const r = await doc.fertility.cancelCycle.mutate({ cycleId, reasonCode: "ohss_risk", note: "sim: E2 rising steeply" });
      ensure(r.status === "cancelled" && r.category === "ohss_risk", `expected an OHSS-coded cancellation, got ${r.status}/${r.category ?? "none"}`);
      const timeline = await wifePortal.portal.cycleTimeline.query({ patientId: wifeId, cycleId });
      ensure(timeline.timeline.cancelled, "expected the portal timeline to show the cycle cancelled");
    });
  }

  // ── revenue cycle ─────────────────────────────────────────────────────────
  let portalPayableInvoiceId: string | undefined;
  let portalPayableAmountFils = 0;
  if (plan.variant === "cancel") {
    // Cancelled journey: a plain consultation invoice, paid via KNET, then a
    // reason-coded gateway refund.
    const invoice = await j.step(at, "raise consultation invoice", "billing.createInvoice", () =>
      fin.billing.createInvoice.mutate({
        patientId: wifeId,
        lines: [{ chargeCode: CONSULT_CODE, description: N("Consultation (simulator)"), unitAmountFils: 25_000, quantity: 1 }],
      }),
    );
    if (invoice !== undefined) {
      printableInvoiceId = invoice.invoiceId;
      await j.step(at, "KNET payment via gateway", "billing.gatewayPay", async () => {
        const r = await fin.billing.gatewayPay.mutate({ invoiceId: invoice.invoiceId, amountFils: 25_000, method: "knet" });
        ensure(r.gatewayRef.startsWith("CHG-KNET-"), `expected a KNET gateway receipt, got ${r.gatewayRef}`);
      });
      await j.step(at, "reason-coded gateway refund", "billing.gatewayRefund", () =>
        fin.billing.gatewayRefund.mutate({ invoiceId: invoice.invoiceId, amountFils: 25_000, method: "knet", reason: "sim.cancel.ohss_risk" }),
      );
    }
  } else if (pkg !== undefined) {
    const sale = await j.step(at, "sell ICSI package", "packages.sell", () => fin.packages.sell.mutate({ patientId: wifeId, packageId: pkg.packageId }));
    if (sale !== undefined) {
      printableInvoiceId = sale.invoiceId;
      const instalmentFils = Math.floor(pkg.priceFils / 5);
      const depositFils = pkg.priceFils - 3 * instalmentFils;
      await j.step(at, "create instalment plan", "instalments.createPlan", () =>
        fin.instalments.createPlan.mutate({
          patientId: wifeId,
          invoiceId: sale.invoiceId,
          depositFils,
          instalments: [
            { dueDate: "2026-10-01T00:00:00.000Z", amountFils: instalmentFils },
            { dueDate: "2026-11-01T00:00:00.000Z", amountFils: instalmentFils },
            { dueDate: "2026-12-01T00:00:00.000Z", amountFils: instalmentFils },
          ],
        }),
      );
      await j.step(at, "progression blocked until deposit", "instalments.progressionAllowed", async () => {
        const r = await fin.instalments.progressionAllowed.query({ patientId: wifeId, asOf: "2026-09-15T00:00:00.000Z" });
        ensure(!r.allowed, "expected progression to be blocked while the deposit is unpaid");
      });
      await j.step(at, "KNET deposit via gateway", "billing.gatewayPay", async () => {
        const r = await fin.billing.gatewayPay.mutate({ invoiceId: sale.invoiceId, amountFils: depositFils, method: "knet" });
        ensure(r.gatewayRef.startsWith("CHG-KNET-"), `expected a KNET gateway receipt, got ${r.gatewayRef}`);
      });
      await j.step(at, "progression allowed after deposit", "instalments.progressionAllowed", async () => {
        const r = await fin.instalments.progressionAllowed.query({ patientId: wifeId, asOf: "2026-09-15T00:00:00.000Z" });
        ensure(r.allowed, `expected progression to be allowed after the deposit (reason: ${r.reason ?? "none"})`);
      });
      await j.step(at, "capture scans against package", "charges.capture", async () => {
        const r = await fin.charges.capture.mutate({
          patientId: wifeId,
          chargeCode: SCAN_CODE,
          quantity: 5,
          source: "clinical",
          occurredAt: "2026-09-10T08:00:00.000Z",
          patientPackageId: sale.patientPackageId,
        });
        ensure(r.recognisedQuantity === 4 && r.billableQuantity === 1, `expected 4 recognised + 1 billable scans, got ${r.recognisedQuantity}+${r.billableQuantity}`);
      });
      await j.step(at, "capture extra consultation", "charges.capture", () =>
        fin.charges.capture.mutate({ patientId: wifeId, chargeCode: CONSULT_CODE, quantity: 1, source: "clinical", occurredAt: "2026-09-10T08:30:00.000Z" }),
      );
      const extras = await j.step(at, "invoice captured extras", "charges.invoicePatient", async () => {
        const r = await fin.charges.invoicePatient.mutate({ patientId: wifeId });
        ensure(r.lineCount === 2, `expected 2 extra lines (1 scan + consult), got ${r.lineCount}`);
        return r;
      });
      if (extras !== undefined) {
        portalPayableInvoiceId = extras.invoiceId;
        portalPayableAmountFils = 40_000; // 1 extra scan (15000) + consult (25000)
      }
      await j.step(at, "package recognition report", "packages.recognition", async () => {
        const r = await fin.packages.recognition.query({ patientPackageId: sale.patientPackageId });
        ensure(r.components.length >= 1, "expected at least one recognised package component");
      });
    }
  }

  // ── the patient portal (own-data only) ────────────────────────────────────
  await j.step(at, "portal: balances", "portal.balances", async () => {
    const r = await wifePortal.portal.balances.query({ patientId: wifeId });
    ensure(r.invoices.length >= 1, "expected at least one invoice on the portal");
  });
  if (portalPayableInvoiceId !== undefined) {
    const invoiceId = portalPayableInvoiceId;
    const amountFils = portalPayableAmountFils;
    await j.step(at, "portal: pay extras via KNET", "portal.payInvoice", async () => {
      const r = await wifePortal.portal.payInvoice.mutate({ patientId: wifeId, invoiceId, amountFils, method: "knet" });
      ensure(r.balanceFils === 0, `expected the extras invoice to be settled, balance ${r.balanceFils}`);
    });
  }
  await j.step(at, "portal: released results visible", "portal.results", async () => {
    const r = await wifePortal.portal.results.query({ patientId: wifeId });
    ensure(r.results.length >= 1, "expected the released AMH result to be visible");
  });
  await j.step(at, "portal: appointments", "portal.appointments", async () => {
    const r = await wifePortal.portal.appointments.query({ patientId: wifeId });
    ensure(r.appointments.length >= 1, "expected the booked appointment to be visible");
  });
  await j.step(at, "portal: self-service booking", "portal.book", () =>
    wifePortal.portal.book.mutate({
      patientId: wifeId,
      typeId: MONITORING_TYPE_ID,
      practitionerId,
      resourceIds: [],
      start: "2026-09-08T09:00:00.000Z",
      end: "2026-09-08T09:30:00.000Z",
    }),
  );
  const thread = await j.step(at, "portal: start message thread", "portal.startThread", () =>
    wifePortal.portal.startThread.mutate({ patientId: wifeId, subject: "Question", body: "When is my next scan?" }),
  );
  if (thread !== undefined) {
    await j.step(at, "staff: reply to thread", "messaging.reply", () => doc.messaging.reply.mutate({ threadId: thread.threadId, body: "The nurse will call you today." }));
    await j.step(at, "portal: send follow-up message", "portal.sendMessage", () =>
      wifePortal.portal.sendMessage.mutate({ patientId: wifeId, threadId: thread.threadId, body: "Thank you." }),
    );
    await j.step(at, "portal: read thread", "portal.threadMessages", async () => {
      const r = await wifePortal.portal.threadMessages.query({ patientId: wifeId, threadId: thread.threadId });
      ensure(r.messages.length === 3, `expected 3 messages in the thread, got ${r.messages.length}`);
    });
  }
  await j.step(at, "portal: register discreet push", "portal.registerPush", () =>
    wifePortal.portal.registerPush.mutate({ patientId: wifeId, endpoint: `https://sim.push/${tag}`, locale: "ar" }),
  );
  if (plan.partnerAccess) {
    await j.step(at, "portal: grant partner access", "portal.grantPartnerAccess", () =>
      wifePortal.portal.grantPartnerAccess.mutate({ patientId: wifeId, partnerId: husbandId }),
    );
    await j.step(at, "portal: partner reads balances", "portal.balances", async () => {
      const r = await env.patient(husbandId).portal.balances.query({ patientId: wifeId });
      ensure(r.invoices.length >= 1, "expected the partner grant to allow reading the wife's balances");
    });
    await j.step(at, "portal: list partner grants", "portal.partnerGrants", async () => {
      const r = await wifePortal.portal.partnerGrants.query({ patientId: wifeId });
      ensure(r.grants.length >= 1, "expected the partner grant to be listed");
    });
  }

  // ── print pack (ADR-0068): server-rendered bilingual HTML for the paper the
  // clinic hands out — the receipt for the paid invoice and the prescription
  // printout, driven through existing tokens (fin: financial reads; phm: dispense
  // reads). A failure is captured, never thrown (Journal), keeping the report shape.
  await j.step(at, "print: receipt + prescription", "print.receipt", async () => {
    if (printableInvoiceId !== undefined) {
      const receipt = await fin.print.receipt.query({ invoiceId: printableInvoiceId, locale: "ar" });
      ensure(receipt.html.includes("<!DOCTYPE html>"), "expected receipt HTML");
      ensure(!receipt.html.toLowerCase().includes("tax") && !receipt.html.includes("ضريبة"), "receipt must carry NO tax line (ADR-0035)");
    }
    if (printablePrescriptionId !== undefined) {
      const rx = await phm.print.prescription.query({ prescriptionId: printablePrescriptionId, locale: "en" });
      ensure(rx.html.includes("<!DOCTYPE html>"), "expected prescription HTML");
    }
  });
}

/** Run the whole simulation: `loops` passes over `couples` couple journeys,
 *  with the audit hash-chain verified at the end of every loop. */
export async function runSimulation(opts: SimulationOptions): Promise<SimulationReport> {
  const startedAt = new Date().toISOString();
  const rng = mulberry32(opts.seed);
  // Per-run namespace for identity strings (civil ids, cryo positions, booked
  // resources) so re-runs against a persistent staging DB never collide. All
  // journey DECISIONS still come from the seeded PRNG above.
  const runTag = Date.now().toString(36);
  const j = new Journal();
  const env: Env = {
    doc: apiClient(opts.url, staffToken("dev-consultant")),
    emb: apiClient(opts.url, staffToken("dev-embryologist")),
    fin: apiClient(opts.url, staffToken("dev-finance")),
    phm: apiClient(opts.url, staffToken("dev-pharmacist")),
    ops: apiClient(opts.url, staffToken("dev-ops")),
    patient: (personId: string) => apiClient(opts.url, `devpatient:${personId}`),
    j,
    runTag,
  };

  const config = await ensureConfig(env, { loop: 0, couple: -1 });

  let auditChainIntact = false;
  for (let loop = 0; loop < opts.loops; loop += 1) {
    for (let couple = 0; couple < opts.couples; couple += 1) {
      const at: StepAt = { loop, couple };
      await runCoupleJourney(env, at, planCouple(rng, couple), config);
    }
    // The audit hash-chain must verify EVERY loop — a broken chain is a failure.
    const check = await j.step({ loop, couple: -1 }, "audit hash-chain verification", "dev.verifyAuditChain", async () => {
      const r = await env.doc.dev.verifyAuditChain.query();
      ensure(r.intact, `audit hash-chain broken: ${r.detail ?? "no detail"}`);
      return r;
    });
    auditChainIntact = check?.intact === true;
  }

  return {
    url: opts.url,
    seed: opts.seed,
    couples: opts.couples,
    loops: opts.loops,
    startedAt,
    finishedAt: new Date().toISOString(),
    stepsRun: j.stepsRun,
    stepsPassed: j.stepsPassed,
    stepsFailed: j.errors.length,
    auditChainIntact,
    errors: j.errors,
    routerGaps: ROUTER_GAPS,
  };
}
