// Synthetic-patient simulation journeys (staging/synthetic-data ONLY — the
// whole harness talks to the dev/staging HTTP host, which refuses production
// boot). Each "couple" drives a whole-EMR journey OVER REAL HTTP through the
// same tRPC surface the clinic will use: registration → verified marriage →
// booking → clinical encounter/orders/results → embryology with RI Witness
// reconciliation (the stub is fed via the `dev` router — never overridden) →
// outcomes → packages/instalments/KNET → the patient portal — and verifies the
// audit hash-chain every loop. A step failure NEVER stops the run: it is
// recorded in the report and the journey continues where sensible.
//
// Determinism: all VARIATION (couple variant, oocyte counts) comes from the
// seeded PRNG (prng.ts) — no Math.random. Identity strings additionally carry a
// per-run tag so repeated runs against a persistent staging database cannot
// collide on civil ids, storage positions or booked slots.
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
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
 *  drive these through in-process services). The simulator skips them. */
export const ROUTER_GAPS: readonly string[] = [
  "scheduling config: no addAppointmentType/addResource procedure — bookings use synthetic type/resource ids",
  "flow.checkIn: needs a facility locationNodeId, but there is no facility topology read/seed surface (serve.ts does not seed the topology)",
  "fertility cycle engine: no createTreatmentCycle / staff consent-recording / reason-coded cycle-cancel surface — so portal.cycleTimeline, portal.medicationSchedule, portal.outstandingConsents and portal.signConsent cannot be driven (they need a real cycle row)",
  "stimulation: no stim.recordDay or formulary-config surface — stimulation days with formulary drugs cannot be recorded over HTTP",
  "embryology: no recordOocyte / recordFertilisationCheck / recordGrading surface — retrieval and fert-check are represented by synthetic ids around recordInsemination/recordTransfer",
  "witnessing: no ingest/reconciliation read surface (sign-off reconciles live against the provider, so dev.seedWitnessRecord suffices)",
  "perioperative: admit/advance need the seeded facility topology (no API/seed surface on a fresh staging DB), so the pharmacy-gated discharge behind dev.markPharmacyFulfilled is not reachable end-to-end",
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

interface SimPackage {
  readonly packageId: string;
  readonly priceFils: number;
}

/** Config-as-data setup, tolerant of re-runs against a persistent staging DB:
 *  charge codes upsert; the package is find-by-code-or-define. */
async function ensureConfig(env: Env, at: StepAt): Promise<SimPackage | undefined> {
  const { fin, j } = env;
  await j.step(at, "config: charge code SIM-SCAN", "charges.defineCode", () =>
    fin.charges.defineCode.mutate({ code: SCAN_CODE, description: N("Monitoring scan (simulator)"), unitAmountFils: 15_000 }),
  );
  await j.step(at, "config: charge code SIM-CONSULT", "charges.defineCode", () =>
    fin.charges.defineCode.mutate({ code: CONSULT_CODE, description: N("Consultation (simulator)"), unitAmountFils: 25_000 }),
  );
  return j.step(at, "config: ICSI package", "packages.define", async () => {
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

async function runCoupleJourney(env: Env, at: StepAt, plan: CouplePlan, pkg: SimPackage | undefined): Promise<void> {
  const { doc, emb, fin, phm, ops, j, runTag } = env;
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

  // ── scheduling (synthetic type/resource ids — config has no API surface) ──
  await j.step(at, "book monitoring appointment", "scheduling.book", () =>
    doc.scheduling.book.mutate({
      patientId: wifeId,
      typeId: "sim-type-monitoring",
      practitionerId: `sim-doc-${tag}`,
      resourceIds: [],
      start: T0,
      end: "2026-09-01T08:30:00.000Z",
    }),
  );
  // flow.checkIn is skipped: no facility-topology surface (see ROUTER_GAPS).

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
    // Exercises the dev pharmacy stub feed; the perioperative discharge gate it
    // backs is not reachable over HTTP on a fresh DB (see ROUTER_GAPS).
    await j.step(at, "mark pharmacy fulfilled (dev stub)", "dev.markPharmacyFulfilled", () => doc.dev.markPharmacyFulfilled.mutate({ encounterId: enc.encounterId }));

    // Real Ground-floor pharmacy loop (ADR-0066): the clinician raises a
    // FORMULARY-ONLY discharge script for the encounter; the pharmacist dispenses
    // (FEFO from seeded stock) and marks it ready. Config-style + idempotent:
    // stock receipt is additive, so re-runs against a persistent DB just top up.
    const rxId = await j.step(at, "pharmacy: raise → dispense → ready", "pharmacy.raisePrescription", async () => {
      await ops.inventory.receiveStock.mutate({ itemId: "rfsh", lotNo: `SIM-${tag}`, locationId: "pharmacy-ground", quantity: 10, expiryDate: "2028-01-01", receivedAt: T0 });
      const rx = await doc.pharmacy.raisePrescription.mutate({
        patientId: wifeId,
        encounterId: enc.encounterId,
        items: [{ drugId: "rfsh", quantity: 2, doseInstruction: { en: "225 IU daily", ar: "225 وحدة يومياً" } }],
      });
      await phm.pharmacy.dispense.mutate({ prescriptionId: rx.prescriptionId, coldChainHandled: false });
      const ready = await phm.pharmacy.markReady.mutate({ prescriptionId: rx.prescriptionId });
      ensure(ready.status === "ready", `expected the script to be ready, got ${ready.status}`);
      return rx.prescriptionId;
    });
    if (rxId !== undefined) printablePrescriptionId = rxId;
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

  // ── embryology + RI Witness reconciliation ────────────────────────────────
  // The cycle id is synthetic (no cycle-creation surface — see ROUTER_GAPS).
  // Every handling event gets a MATCHING RI record seeded into the stub (as the
  // device would have returned it) so cycle-step sign-off reconciles; seeding
  // happens strictly AFTER the Oxford event so an early record can never sit as
  // an orphan (orphans block sign-off — no override).
  const cycleId = `sim-cycle-${tag}`;
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
  } else {
    // Coded cancellation instead of transfer: the only reason-coded cancel the
    // router exposes is the theatre case (cycle lifecycle has no API surface).
    const theatreCase = await j.step(at, "schedule retrieval theatre case", "perioperative.scheduleCase", () =>
      doc.perioperative.scheduleCase.mutate({
        typeId: "sim-type-theatre",
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
  const wifePortal = env.patient(wifeId);
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
      typeId: "sim-type-monitoring",
      practitionerId: `sim-doc2-${tag}`,
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

  const pkg = await ensureConfig(env, { loop: 0, couple: -1 });

  let auditChainIntact = false;
  for (let loop = 0; loop < opts.loops; loop += 1) {
    for (let couple = 0; couple < opts.couples; couple += 1) {
      const at: StepAt = { loop, couple };
      await runCoupleJourney(env, at, planCouple(rng, couple), pkg);
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
