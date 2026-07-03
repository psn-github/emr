// e2e — Ground-floor pharmacy dispensing THROUGH the tRPC API on real Postgres
// (docs/PHASE8_PLAN §8.1, ADR-0066). Proves the whole ward→pharmacy→door loop:
// formulary-only rejection → raise (allergy advisory recorded, not blocked) →
// Ground queue → dispense decrements the REAL inventory lot (FEFO: earlier expiry
// first) → controlled item needs a witness + posts to the controlled register →
// cold-chain needs the explicit flag → markReady → the L2 discharge gate passes
// on REAL fulfilment (no dev stub) → RBAC → audit hash-chain intact.
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
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*", "scheduling:*"] }] },
  mfa: true,
};
const pharmacist: Session = {
  sessionId: "s-phm",
  subject: { staffId: "phm-1", roles: [{ id: "pharmacist", name: "pharmacist", permissions: ["clinical:dispense.read", "clinical:dispense.write"] }] },
  mfa: true,
};
const stores: Session = {
  sessionId: "s-stores",
  subject: { staffId: "stores-1", roles: [{ id: "stores", name: "stores", permissions: ["admin:inventory.read", "admin:inventory.write"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-rec",
  subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
  mfa: false,
};

const LOC = "pharmacy-ground";
const dose = { en: "225 IU daily", ar: "225 وحدة يومياً" };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("Ground-floor pharmacy dispensing (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;
  let phm: ReturnType<typeof appRouter.createCaller>;
  let ops: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE pharmacy.prescription, pharmacy.dispense, inventory.supplier, inventory.catalogue_item, inventory.stock_lot, inventory.cd_movement, clinical.drug_allergy, facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, perioperative.observation, perioperative.follow_up, registry.person, audit.audit_log",
    );
    services = buildServices(pool);
    await seedFacility(services.facility);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
    phm = appRouter.createCaller({ session: pharmacist, patient: null, services });
    ops = appRouter.createCaller({ session: stores, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("rejects a non-formulary drug (formulary-only, BAD_REQUEST)", async () => {
    await expectCode(
      () => doc.pharmacy.raisePrescription({ patientId: "pat-x", items: [{ drugId: "aspirin", quantity: 1, doseInstruction: dose }] }),
      "BAD_REQUEST",
    );
  });

  it("raises with an allergy advisory (not blocked), queues, FEFO-dispenses the real lot, markReady", async () => {
    const patientId = "pat-1";
    // A coded drug-class allergy (the existing clinical allergy surface, ADR-0060).
    await doc.clinical.recordAllergy({ patientId, drugClass: "gonadotropin_fsh", substance: { en: "Recombinant FSH", ar: "FSH" }, severity: "severe", reaction: "urticaria" });

    // Seed two rFSH lots at the Ground pharmacy (later + earlier expiry) via the
    // inventory router — FEFO must consume the earlier-expiry lot first.
    await ops.inventory.receiveStock({ itemId: "rfsh", lotNo: "RFSH-LATE", locationId: LOC, quantity: 5, expiryDate: "2028-01-01", receivedAt: "2026-07-01T08:00:00Z" });
    await ops.inventory.receiveStock({ itemId: "rfsh", lotNo: "RFSH-EARLY", locationId: LOC, quantity: 1, expiryDate: "2027-01-01", receivedAt: "2026-07-01T08:00:00Z" });
    expect((await ops.inventory.onHand({ itemId: "rfsh" })).onHand).toBe(6);

    const raised = await doc.pharmacy.raisePrescription({ patientId, items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }] });
    expect(raised.status).toBe("pending");
    expect(raised.allergyWarnings).toEqual([{ drugId: "rfsh", drugClass: "gonadotropin_fsh" }]); // advisory, still raised

    // Appears in the Ground pharmacy queue (pending).
    const queue = await phm.pharmacy.queue({ status: "pending" });
    expect(queue.prescriptions.map((p) => p.id)).toContain(raised.prescriptionId);

    // Dispense: FEFO consumes RFSH-EARLY (1) then RFSH-LATE (1); real stock drops.
    const d = await phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId, coldChainHandled: false });
    expect(d.allocations).toEqual([
      { drugId: "rfsh", lotNo: "RFSH-EARLY", expiry: "2027-01-01", quantity: 1 },
      { drugId: "rfsh", lotNo: "RFSH-LATE", expiry: "2028-01-01", quantity: 1 },
    ]);
    expect((await ops.inventory.onHand({ itemId: "rfsh" })).onHand).toBe(4);
    expect((await phm.pharmacy.get({ prescriptionId: raised.prescriptionId })).status).toBe("dispensing");

    const ready = await phm.pharmacy.markReady({ prescriptionId: raised.prescriptionId });
    expect(ready.status).toBe("ready");

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("a controlled item requires a witness and posts a witnessed movement to the register", async () => {
    // A controlled formulary drug: seed a catalogue item sharing the drug's
    // formulary code, flagged controlled (the catalogue is the controlled/cold-
    // chain source; the formulary code is the shared join key).
    await services.catalogue.addItem("stores-1", { id: "hcg_trigger", name: "hCG trigger", category: "drug", unit: "mcg", packSize: 1, coldChain: false, controlled: true, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "hcg_trigger", lotNo: "CD-1", locationId: LOC, quantity: 4, expiryDate: "2027-06-01", receivedAt: "2026-07-01T08:00:00Z" });
    // The controlled-drugs register (witnessed) books the receipt into stock.
    await doc.controlledDrugs.record({ itemId: "hcg_trigger", lotNo: "CD-1", type: "receipt", quantity: 4, reason: "stock receipt", witnessedBy: "phm-2", occurredAt: "2026-07-01T08:00:00Z" });

    const raised = await doc.pharmacy.raisePrescription({ patientId: "pat-2", items: [{ drugId: "hcg_trigger", quantity: 2, doseInstruction: { en: "250 mcg once", ar: "250 مرة واحدة" } }] });

    // Without a witness → rejected (controlled two-person rule).
    await expectCode(() => phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId }), "BAD_REQUEST");

    // With a second-person witness → dispensed, and the register carries the issue.
    await phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId, witnessStaffId: "phm-2" });
    const report = await doc.controlledDrugs.periodReport({ itemId: "hcg_trigger", from: "2026-01-01T00:00:00Z", to: "2027-12-31T00:00:00Z" });
    expect(report.movements.some((m) => m.type === "issue" && m.quantity === 2 && m.witnessedBy === "phm-2" && m.patientRef === "pat-2")).toBe(true);
    expect((await doc.controlledDrugs.balance({ itemId: "hcg_trigger" })).balance).toBe(2); // 4 received − 2 dispensed
  });

  it("a cold-chain item requires the explicit cold-chain-handled flag", async () => {
    await services.catalogue.addItem("stores-1", { id: "progesterone", name: "Progesterone", category: "drug", unit: "mg", packSize: 1, coldChain: true, controlled: false, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "progesterone", lotNo: "PROG-1", locationId: LOC, quantity: 10, expiryDate: "2027-06-01", receivedAt: "2026-07-01T08:00:00Z" });
    const raised = await doc.pharmacy.raisePrescription({ patientId: "pat-3", items: [{ drugId: "progesterone", quantity: 1, doseInstruction: { en: "400 mg", ar: "400 ملغ" } }] });

    await expectCode(() => phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId }), "BAD_REQUEST"); // no cold-chain flag
    const d = await phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId, coldChainHandled: true });
    expect(d.allocations[0]).toMatchObject({ drugId: "progesterone", lotNo: "PROG-1", quantity: 1 });
  });

  it("insufficient stock leaves the prescription pending (PRECONDITION_FAILED)", async () => {
    await ops.inventory.receiveStock({ itemId: "rfsh", lotNo: "L1", locationId: LOC, quantity: 1, expiryDate: "2027-01-01", receivedAt: "2026-07-01T08:00:00Z" });
    const raised = await doc.pharmacy.raisePrescription({ patientId: "pat-4", items: [{ drugId: "rfsh", quantity: 5, doseInstruction: dose }] });
    await expectCode(() => phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId }), "PRECONDITION_FAILED");
    expect((await phm.pharmacy.get({ prescriptionId: raised.prescriptionId })).status).toBe("pending");
    expect((await ops.inventory.onHand({ itemId: "rfsh" })).onHand).toBe(1); // untouched
  });

  it("the L2 discharge gate passes on REAL pharmacy fulfilment (no dev stub)", async () => {
    // Drive the perioperative journey to the post-op ward (mirrors discharge.e2e,
    // but WITHOUT services.pharmacyStub.markFulfilled).
    const p = await doc.registry.registerPerson({ name: { ar: "م", en: "P" }, civilId: "290010140777", dob: "1990-01-01", sex: "female", nationality: "KW", languagePref: "ar" });
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

    // A discharge prescription linked to the encounter — pending → blocks discharge.
    await ops.inventory.receiveStock({ itemId: "rfsh", lotNo: "DIS-1", locationId: LOC, quantity: 10, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    const raised = await doc.pharmacy.raisePrescription({ patientId: p.personId, encounterId, items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }] });
    await doc.perioperative.bookFollowUp({ encounterId, scheduledFor: "2026-07-05T09:00:00Z", bookedAt: "2026-06-22T11:00:00Z" });

    // Follow-up booked but the script is not ready → still blocked (real fulfilment).
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

    await phm.pharmacy.dispense({ prescriptionId: raised.prescriptionId });
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED"); // dispensing, not yet ready
    await phm.pharmacy.markReady({ prescriptionId: raised.prescriptionId });

    // Ready → the discharge gate now passes on REAL fulfilment; the L2 bed frees.
    const discharged = await doc.perioperative.advance({ encounterId, toStage: "discharged" });
    expect(discharged.stage).toBe("discharged");
    const l2 = (await services.flow.board()).capacity.find((c) => c.level === "L2")!;
    expect(l2.occupied).toBe(0);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("RBAC: reception FORBIDDEN on dispense; pharmacist FORBIDDEN on raisePrescription", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.pharmacy.dispense({ prescriptionId: "x" }), "FORBIDDEN");
    await expectCode(() => rec.pharmacy.queue({}), "FORBIDDEN");
    await expectCode(() => phm.pharmacy.raisePrescription({ patientId: "p", items: [{ drugId: "rfsh", quantity: 1, doseInstruction: dose }] }), "FORBIDDEN");
  });
});
