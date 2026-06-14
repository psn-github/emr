// P1 — CYCLE TEMPLATES + COHORT VIEW, end-to-end on real Postgres. Proves: a
// consultant lists templates (config) and starts a cycle in one step (type +
// protocol applied); and the bulk cohort view ("all patients stimulating this
// week") filters by status + creation window — with the audit chain intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fixedClock, type Result, type AppError } from "@oxford/core";
import {
  CycleService,
  PgCycleStore,
  PgReasonCodeStore,
  PgCycleTemplateStore,
  seedCycleTemplates,
  SEED_CYCLE_TEMPLATES,
  type FertilityGate,
} from "@oxford/fertility";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const allowGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: true, value: undefined }) };

describe.skipIf(!DATABASE_URL)("P1 cycle templates + cohort view (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  let services: ReturnType<typeof buildServices>;
  let cycles: CycleService;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedCycleTemplates(pool, SEED_CYCLE_TEMPLATES);
    services = buildServices(pool);
    cycles = new CycleService(new PgCycleStore(pool), services.audit, services.events, clock, allowGate, new PgReasonCodeStore(pool), new PgCycleTemplateStore(pool));
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE fertility.cycle");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lists seeded templates for a consultant (own + clinic-wide)", async () => {
    const list = await cycles.listTemplates("doc-1");
    expect(list.some((t) => t.id === "antagonist_icsi")).toBe(true);
    expect(list.some((t) => t.id === "mild_preservation")).toBe(true);
  });

  it("starts cycles from templates and serves the 'stimulating this week' cohort", async () => {
    // one-step start: treatment (couple) + preservation (person), protocols applied
    const icsi = await cycles.createCycleFromTemplate("doc-1", "antagonist_icsi", { kind: "couple", coupleId: "couple-1" });
    expect(icsi.ok && icsi.value.type).toBe("icsi");
    expect(icsi.ok && icsi.value.protocolId).toBe("antagonist");
    if (!icsi.ok) return;
    const preservation = await cycles.createCycleFromTemplate("doc-1", "mild_preservation", { kind: "person", personId: "person-1" });
    expect(preservation.ok && preservation.value.type).toBe("fertility_preservation");

    // advance the ICSI cycle into stimulation
    for (const k of ["consent.icsi", "consent.anaesthesia", "consent.data_processing"]) await cycles.recordConsent("doc-1", icsi.value.id, k);
    await cycles.advanceStatus("doc-1", icsi.value.id, "stimulating");

    // cohort by status: only the stimulating cycle
    const stimulating = await cycles.cohort({ status: "stimulating" });
    expect(stimulating.map((c) => c.id)).toEqual([icsi.value.id]);

    // cohort by creation window: both cycles created "this week" (fixed clock 2026-06-22)
    const thisWeek = await cycles.cohort({ createdAfter: "2026-06-22T00:00:00.000Z", createdBefore: "2026-06-23T00:00:00.000Z" });
    expect(thisWeek.length).toBe(2);
    expect(await cycles.cohort({ createdAfter: "2026-07-01T00:00:00.000Z" })).toEqual([]);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
