// e2e — pharmacy THROUGH the tRPC API on real Postgres (docs/PHASE8_PLAN §8.1,
// ADR-0069 — supersedes the dispensing model of ADR-0066). The Ground-floor pharmacy
// is EXTERNAL. Proves BOTH loops end-to-end:
//   (a) PRESCRIPTION (external fulfilment): a discharge script raised on L2 → issued
//       → discharge BLOCKED → external fulfilment recorded → discharge gate passes.
//       Asserts the prescription path performs NO inventory decrement and NO
//       controlled-register movement.
//   (b) THEATRE DRUG ADMINISTRATION (in-house stock): a controlled anaesthetic with a
//       witness → theatre stock decremented FEFO + a witnessed controlled-register
//       movement present + the register reconciles; missing witness REJECTED;
//       cold-chain unasserted REJECTED.
// Plus formulary-only rejection, RBAC deny, and audit hash-chain intact.
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

const THEATRE = "theatre-l1";
const dose = { en: "225 IU daily", ar: "225 وحدة يومياً" };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("Pharmacy: external prescriptions + theatre drugs (e2e via the API + real Postgres)", () => {
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
      "TRUNCATE pharmacy.prescription, pharmacy.theatre_drug_administration, inventory.supplier, inventory.catalogue_item, inventory.stock_lot, inventory.cd_movement, clinical.drug_allergy, facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement, perioperative.surgical_encounter, perioperative.who_checklist, perioperative.observation, perioperative.follow_up, registry.person, audit.audit_log",
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

  it("raises with an allergy advisory (not blocked), then issue → external fulfilment", async () => {
    const patientId = "pat-1";
    await doc.clinical.recordAllergy({ patientId, drugClass: "gonadotropin_fsh", substance: { en: "Recombinant FSH", ar: "FSH" }, severity: "severe", reaction: "urticaria" });

    const raised = await doc.pharmacy.raisePrescription({ patientId, items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }] });
    expect(raised.status).toBe("pending");
    expect(raised.allergyWarnings).toEqual([{ drugId: "rfsh", drugClass: "gonadotropin_fsh" }]); // advisory, still raised

    // Appears in the ward's outstanding-scripts queue (pending).
    const queue = await phm.pharmacy.queue({ status: "pending" });
    expect(queue.prescriptions.map((p) => p.id)).toContain(raised.prescriptionId);

    expect((await phm.pharmacy.issue({ prescriptionId: raised.prescriptionId })).status).toBe("issued");
    const fulfilled = await phm.pharmacy.recordExternalFulfilment({ prescriptionId: raised.prescriptionId, externalRef: "GRD-42", note: "handed over" });
    expect(fulfilled.status).toBe("fulfilled");
    expect(fulfilled.externalRef).toBe("GRD-42");

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("(a) discharge script: raise → issue → discharge BLOCKED → external fulfilment → discharge passes; NO stock/register writes", async () => {
    // A controlled catalogue item sharing a stim-formulary code — so if the
    // prescription path wrongly posted to the register, the balance would move.
    await services.catalogue.addItem("stores-1", { id: "hcg_trigger", name: "hCG trigger", category: "drug", unit: "mcg", packSize: 1, coldChain: false, controlled: true, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "hcg_trigger", lotNo: "CD-1", locationId: THEATRE, quantity: 4, expiryDate: "2027-06-01", receivedAt: "2026-06-22T08:00:00Z" });
    await doc.controlledDrugs.record({ itemId: "hcg_trigger", lotNo: "CD-1", type: "receipt", quantity: 4, reason: "stock receipt", witnessedBy: "phm-2", occurredAt: "2026-06-22T08:00:00Z" });
    // Some plain stock too — its on-hand must be untouched by the prescription path.
    await ops.inventory.receiveStock({ itemId: "rfsh", lotNo: "DIS-1", locationId: THEATRE, quantity: 10, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    const cdBalanceBefore = (await doc.controlledDrugs.balance({ itemId: "hcg_trigger" })).balance;
    const rfshBefore = (await ops.inventory.onHand({ itemId: "rfsh" })).onHand;

    // Drive the perioperative journey to the post-op ward (mirrors discharge.e2e,
    // WITHOUT services.pharmacyStub.markFulfilled — real fulfilment only).
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

    // A discharge prescription linked to the encounter (a controlled + a plain drug).
    const raised = await doc.pharmacy.raisePrescription({ patientId: p.personId, encounterId, items: [{ drugId: "rfsh", quantity: 2, doseInstruction: dose }, { drugId: "hcg_trigger", quantity: 1, doseInstruction: { en: "250 mcg once", ar: "250 مرة واحدة" } }] });
    await doc.perioperative.bookFollowUp({ encounterId, scheduledFor: "2026-07-05T09:00:00Z", bookedAt: "2026-06-22T11:00:00Z" });

    // Pending → discharge blocked even with the follow-up booked (real fulfilment).
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

    // Issued (printed/handed over) → still blocked (not yet confirmed fulfilled).
    await phm.pharmacy.issue({ prescriptionId: raised.prescriptionId });
    await expectCode(() => doc.perioperative.advance({ encounterId, toStage: "discharged" }), "PRECONDITION_FAILED");

    // External pharmacy confirms the handover → the discharge gate now passes.
    await phm.pharmacy.recordExternalFulfilment({ prescriptionId: raised.prescriptionId, externalRef: "GRD-9" });
    const discharged = await doc.perioperative.advance({ encounterId, toStage: "discharged" });
    expect(discharged.stage).toBe("discharged");
    const l2 = (await services.flow.board()).capacity.find((c) => c.level === "L2")!;
    expect(l2.occupied).toBe(0);

    // The prescription path moved NO clinic stock and posted NO register movement.
    expect((await ops.inventory.onHand({ itemId: "rfsh" })).onHand).toBe(rfshBefore); // 10, untouched
    expect((await doc.controlledDrugs.balance({ itemId: "hcg_trigger" })).balance).toBe(cdBalanceBefore); // 4, no issue posted

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("(b) theatre administration of a controlled anaesthetic (witnessed) decrements FEFO + posts a witnessed register movement that reconciles", async () => {
    // A controlled anaesthetic — the code is in the anaesthesia formulary; the
    // catalogue item (shared code) flags it controlled and is the register's item.
    await services.catalogue.addItem("stores-1", { id: "fentanyl", name: "Fentanyl", category: "drug", unit: "mcg", packSize: 1, coldChain: false, controlled: true, parLevel: 5 });
    // Two theatre lots (earlier + later expiry) — FEFO must take the earlier first.
    await ops.inventory.receiveStock({ itemId: "fentanyl", lotNo: "FEN-LATE", locationId: THEATRE, quantity: 3, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    await ops.inventory.receiveStock({ itemId: "fentanyl", lotNo: "FEN-EARLY", locationId: THEATRE, quantity: 1, expiryDate: "2027-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    // The controlled-drugs register books the receipts (witnessed).
    await doc.controlledDrugs.record({ itemId: "fentanyl", lotNo: "FEN-LATE", type: "receipt", quantity: 3, reason: "stock receipt", witnessedBy: "phm-2", occurredAt: "2026-06-22T08:00:00Z" });
    await doc.controlledDrugs.record({ itemId: "fentanyl", lotNo: "FEN-EARLY", type: "receipt", quantity: 1, reason: "stock receipt", witnessedBy: "phm-2", occurredAt: "2026-06-22T08:00:00Z" });
    expect((await ops.inventory.onHand({ itemId: "fentanyl" })).onHand).toBe(4);

    const admin = await phm.pharmacy.administerTheatreDrugs({ encounterId: "enc-op", patientId: "pat-op", drugs: [{ drugId: "fentanyl", quantity: 2 }], witnessStaffId: "phm-2" });
    // FEFO consumes FEN-EARLY (1) then FEN-LATE (1); theatre stock drops by 2.
    expect(admin.allocations).toEqual([
      { drugId: "fentanyl", lotNo: "FEN-EARLY", expiry: "2027-01-01", quantity: 1 },
      { drugId: "fentanyl", lotNo: "FEN-LATE", expiry: "2028-01-01", quantity: 1 },
    ]);
    expect((await ops.inventory.onHand({ itemId: "fentanyl" })).onHand).toBe(2);

    // A witnessed issue movement is present and the register reconciles (4 − 2 = 2).
    const report = await doc.controlledDrugs.periodReport({ itemId: "fentanyl", from: "2026-01-01T00:00:00Z", to: "2027-12-31T00:00:00Z" });
    expect(report.movements.some((m) => m.type === "issue" && m.quantity === 1 && m.witnessedBy === "phm-2" && m.patientRef === "pat-op")).toBe(true);
    expect((await doc.controlledDrugs.balance({ itemId: "fentanyl" })).balance).toBe(2);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("(b) a controlled theatre drug WITHOUT a witness is rejected (no stock decrement)", async () => {
    await services.catalogue.addItem("stores-1", { id: "fentanyl", name: "Fentanyl", category: "drug", unit: "mcg", packSize: 1, coldChain: false, controlled: true, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "fentanyl", lotNo: "FEN-1", locationId: THEATRE, quantity: 4, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    await expectCode(() => phm.pharmacy.administerTheatreDrugs({ encounterId: "enc-op", patientId: "pat-op", drugs: [{ drugId: "fentanyl", quantity: 2 }] }), "BAD_REQUEST");
    expect((await ops.inventory.onHand({ itemId: "fentanyl" })).onHand).toBe(4); // untouched
  });

  it("(b) a cold-chain theatre drug with the cold-chain unasserted is rejected", async () => {
    await services.catalogue.addItem("stores-1", { id: "sevoflurane", name: "Sevoflurane", category: "drug", unit: "ml", packSize: 1, coldChain: true, controlled: false, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "sevoflurane", lotNo: "SEV-1", locationId: THEATRE, quantity: 10, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    await expectCode(() => phm.pharmacy.administerTheatreDrugs({ encounterId: "enc-op", patientId: "pat-op", drugs: [{ drugId: "sevoflurane", quantity: 1 }] }), "BAD_REQUEST");
    const admin = await phm.pharmacy.administerTheatreDrugs({ encounterId: "enc-op", patientId: "pat-op", drugs: [{ drugId: "sevoflurane", quantity: 1 }], coldChainHandled: true });
    expect(admin.allocations[0]).toMatchObject({ drugId: "sevoflurane", lotNo: "SEV-1", quantity: 1 });
  });

  it("theatre administration on insufficient stock leaves no decrement (PRECONDITION_FAILED)", async () => {
    await services.catalogue.addItem("stores-1", { id: "propofol", name: "Propofol", category: "drug", unit: "mg", packSize: 1, coldChain: false, controlled: false, parLevel: 5 });
    await ops.inventory.receiveStock({ itemId: "propofol", lotNo: "P-1", locationId: THEATRE, quantity: 1, expiryDate: "2028-01-01", receivedAt: "2026-06-22T08:00:00Z" });
    await expectCode(() => phm.pharmacy.administerTheatreDrugs({ encounterId: "enc-op", patientId: "pat-op", drugs: [{ drugId: "propofol", quantity: 5 }] }), "PRECONDITION_FAILED");
    expect((await ops.inventory.onHand({ itemId: "propofol" })).onHand).toBe(1); // untouched
  });

  it("RBAC: reception FORBIDDEN on the pharmacy write surface; pharmacist FORBIDDEN on raisePrescription", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.pharmacy.recordExternalFulfilment({ prescriptionId: "x" }), "FORBIDDEN");
    await expectCode(() => rec.pharmacy.administerTheatreDrugs({ encounterId: "e", patientId: "p", drugs: [] }), "FORBIDDEN");
    await expectCode(() => rec.pharmacy.queue({}), "FORBIDDEN");
    await expectCode(() => phm.pharmacy.raisePrescription({ patientId: "p", items: [{ drugId: "rfsh", quantity: 1, doseInstruction: dose }] }), "FORBIDDEN");
  });
});
