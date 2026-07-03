// The synthetic-patient simulator, END TO END: boot the real HTTP host on a
// random port against real Postgres, run the exported journey-runner over real
// HTTP (2 couples, 1 loop, fixed seed) and require a CLEAN run — zero step
// failures and an intact audit hash-chain. This is the CI guarantee that the
// whole-EMR simulation (registration → marriage gate → clinic → embryology with
// RI Witness reconciliation → revenue cycle → portal) stays green forever.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { createApiServer } from "./http-host.js";
import { devStaffDirectory } from "./staff-directory.js";
import { appRouter } from "./router.js";
import { runSimulation } from "./simulator/journeys.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("synthetic-patient simulator (e2e over real HTTP + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
    // isProduction: false ⇒ the dev-tools router (stub feeds) is enabled.
    server = createApiServer({ services, pool, isProduction: false, resolveSubject: devStaffDirectory(false) });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await pool.end();
  });

  it("runs 2 couple journeys in 1 loop with ZERO errors and an intact audit chain", { timeout: 120_000 }, async () => {
    const report = await runSimulation({ url: base, couples: 2, loops: 1, seed: 42 });

    expect(report.errors).toEqual([]);
    expect(report.stepsFailed).toBe(0);
    expect(report.stepsPassed).toBe(report.stepsRun);
    // Sanity: the run actually drove a whole-EMR journey, not a no-op.
    expect(report.stepsRun).toBeGreaterThan(40);
    expect(report.auditChainIntact).toBe(true);
  });

  it("the dev-tools router is FORBIDDEN wherever devTools is not enabled", async () => {
    // Every context that does not opt in (all ~70 in-process e2e contexts, and
    // any production host) is denied — deny-by-default, like everything else.
    const caller = appRouter.createCaller({ session: null, patient: null, services });
    await expect(caller.dev.verifyAuditChain()).rejects.toMatchObject({ code: "FORBIDDEN", message: "dev tools are disabled" });
    await expect(caller.dev.markPharmacyFulfilled({ encounterId: "enc-x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.dev.seedWitnessRecord({
        cycleId: "cycle-x",
        record: { riRecordId: "ri-x", oxfordKey: "k", patientId: "p", sampleId: "s", outcome: "witnessed", witnessedAt: "2026-01-01T00:00:00Z" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
