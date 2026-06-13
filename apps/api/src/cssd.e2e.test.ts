// e2e — CSSD instrument-set tracking THROUGH the tRPC API on real Postgres
// (docs/01 §E7). Proves: a set may only be used when sterile; using it is traced
// (set→patient→cycle) and blocks reuse until reprocessed; RBAC.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

describe.skipIf(!DATABASE_URL)("CSSD instrument-set tracking (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let doc: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE perioperative.instrument_set, perioperative.sterilisation_cycle, perioperative.set_usage");
    services = buildServices(pool);
    doc = appRouter.createCaller({ session: clinician, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("blocks using a non-sterile set; allows + traces a sterile one; blocks reuse", async () => {
    const { setId, status } = await doc.perioperative.registerSet({ name: "Laparoscopy set", composition: ["grasper", "scissors"] });
    expect(status).toBe("dirty");

    // dirty → cannot use
    await expectCode(() => doc.perioperative.useSet({ setId, encounterId: "enc-1", usedAt: "2026-06-22T09:00:00Z" }), "PRECONDITION_FAILED");

    await doc.perioperative.recordSterilisation({ setId, cycleType: "steam_134c", loadRef: "LOAD-1", result: "pass", completedAt: "2026-06-22T06:00:00Z" });
    const used = await doc.perioperative.useSet({ setId, encounterId: "enc-1", usedAt: "2026-06-22T09:00:00Z" });
    expect(used.usageId).toBeTruthy();

    // used → cannot reuse until reprocessed
    await expectCode(() => doc.perioperative.useSet({ setId, encounterId: "enc-2", usedAt: "2026-06-22T10:00:00Z" }), "PRECONDITION_FAILED");
  });

  it("a failed sterilisation leaves the set unusable; RBAC blocks reception", async () => {
    const { setId } = await doc.perioperative.registerSet({ name: "Set", composition: ["x"] });
    await doc.perioperative.recordSterilisation({ setId, cycleType: "steam", loadRef: "L", result: "fail", completedAt: "2026-06-22T06:00:00Z" });
    await expectCode(() => doc.perioperative.useSet({ setId, encounterId: "enc-1", usedAt: "z" }), "PRECONDITION_FAILED");

    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.perioperative.registerSet({ name: "x", composition: [] }), "FORBIDDEN");
  });
});
