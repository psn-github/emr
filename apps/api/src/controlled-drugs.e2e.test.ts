// e2e — controlled-drugs register THROUGH the tRPC API on real Postgres (docs/01
// §E8 P0). Proves the legal-grade invariants: every movement is two-person
// witnessed; the running book balance never goes negative; only `controlled`
// catalogue items have a register; a physical count reconciles and a discrepancy
// posts a witnessed adjustment; a period report carries opening/closing balance;
// RBAC keeps the register in the clinical controlled-drugs domain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const pharmacist: Session = {
  sessionId: "s-rx",
  subject: { staffId: "rx-1", roles: [{ id: "pharmacist", name: "pharmacist", permissions: ["clinical:controlled_drugs.read", "clinical:controlled_drugs.write", "admin:inventory.read", "admin:inventory.write"] }] },
  mfa: true,
};
const reception: Session = {
  sessionId: "s-front",
  subject: { staffId: "front-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] },
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

const T = "2026-06-20T08:00:00Z";

describe.skipIf(!DATABASE_URL)("controlled-drugs register (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let rx: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory.catalogue_item, inventory.cd_movement");
    services = buildServices(pool);
    rx = appRouter.createCaller({ session: pharmacist, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  async function controlledItem(): Promise<string> {
    const { itemId } = await rx.inventory.addItem({ name: "Fentanyl 100mcg", category: "drug", unit: "amp", packSize: 1, coldChain: false, controlled: true, parLevel: 0 });
    return itemId;
  }

  it("keeps a witnessed running balance and reconciles a physical count", async () => {
    const itemId = await controlledItem();
    await rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "receipt", quantity: 10, reason: "delivery", witnessedBy: "rx-2", occurredAt: T });
    const issue = await rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "issue", quantity: 3, reason: "theatre", patientRef: "pat-1", witnessedBy: "rx-2", occurredAt: T });
    expect(issue.balanceAfter).toBe(7);
    expect((await rx.controlledDrugs.balance({ itemId })).balance).toBe(7);

    // physical count short by 2 → reconcile posts a witnessed adjustment to 5
    const recon = await rx.controlledDrugs.reconcile({ itemId, lotNo: "L1", physicalCount: 5, witnessedBy: "rx-2", reason: "weekly count", occurredAt: T });
    expect(recon.matched).toBe(false);
    expect(recon.discrepancy).toBe(-2);
    expect((await rx.controlledDrugs.balance({ itemId })).balance).toBe(5);
  });

  it("enforces the legal-grade guards", async () => {
    const itemId = await controlledItem();
    // self-witnessed movement rejected (two-person rule)
    await expectCode(() => rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "receipt", quantity: 5, reason: "r", witnessedBy: "rx-1", occurredAt: T }), "PRECONDITION_FAILED");
    // issuing more than on hand is blocked (never negative)
    await rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "receipt", quantity: 5, reason: "r", witnessedBy: "rx-2", occurredAt: T });
    await expectCode(() => rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "issue", quantity: 9, reason: "r", witnessedBy: "rx-2", occurredAt: T }), "PRECONDITION_FAILED");
    // a non-controlled item has no register
    const { itemId: saline } = await rx.inventory.addItem({ name: "Saline", category: "consumable", unit: "bag", packSize: 1, coldChain: false, controlled: false, parLevel: 0 });
    await expectCode(() => rx.controlledDrugs.record({ itemId: saline, lotNo: "L1", type: "receipt", quantity: 1, reason: "r", witnessedBy: "rx-2", occurredAt: T }), "PRECONDITION_FAILED");
  });

  it("produces a period report and RBAC blocks a non-pharmacy role", async () => {
    const itemId = await controlledItem();
    await rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "receipt", quantity: 10, reason: "r", witnessedBy: "rx-2", occurredAt: "2026-06-01T08:00:00Z" });
    await rx.controlledDrugs.record({ itemId, lotNo: "L1", type: "issue", quantity: 4, reason: "r", witnessedBy: "rx-2", occurredAt: "2026-06-15T08:00:00Z" });
    const rep = await rx.controlledDrugs.periodReport({ itemId, from: "2026-06-10T00:00:00Z", to: "2026-06-20T00:00:00Z" });
    expect(rep.openingBalance).toBe(10);
    expect(rep.closingBalance).toBe(6);

    const front = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => front.controlledDrugs.balance({ itemId }), "FORBIDDEN");
    await expectCode(() => front.controlledDrugs.record({ itemId, lotNo: "L1", type: "receipt", quantity: 1, reason: "r", witnessedBy: "rx-2", occurredAt: T }), "FORBIDDEN");
  });
});
