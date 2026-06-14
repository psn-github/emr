// P1 — CODED CANCELLATIONS + CYCLE CONVERSION, end-to-end on real Postgres.
// Proves: cancellation reasons are coded config (free text rejected); a cycle
// converts (IVF→IUI) into a NEW linked cycle while the source is cancelled with a
// `converted` reason; and the analytics read-model computes cancellation rate (by
// category, conversions excluded) + conversion rate from the fertility counts —
// with the audit hash-chain intact. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fixedClock, type Result, type AppError } from "@oxford/core";
import {
  CycleService,
  PgCycleStore,
  PgReasonCodeStore,
  seedCancellationReasons,
  SEED_CANCELLATION_REASONS,
  type FertilityGate,
} from "@oxford/fertility";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const allowGate: FertilityGate = { assertMayTreat: async (): Promise<Result<void, AppError>> => ({ ok: true, value: undefined }) };

describe.skipIf(!DATABASE_URL)("P1 coded cancellation + conversion (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));
  let services: ReturnType<typeof buildServices>;
  let cycles: CycleService;

  beforeAll(async () => {
    await runMigrations(pool);
    await seedCancellationReasons(pool, SEED_CANCELLATION_REASONS);
    await pool.query("TRUNCATE fertility.cycle, audit.audit_log");
    services = buildServices(pool);
    cycles = new CycleService(new PgCycleStore(pool), services.audit, services.events, clock, allowGate, new PgReasonCodeStore(pool));
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE fertility.cycle");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("rejects an unknown cancellation reason (coded config, never free text)", async () => {
    const c = await cycles.createTreatmentCycle("doc-1", "ivf", "couple-x");
    if (!c.ok) throw new Error("setup");
    const bad = await cycles.cancel("doc-1", c.value.id, "patient changed their mind");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("fertility.cancellation.unknown_reason");
  });

  it("converts IVF→IUI (source cancelled+linked) and computes disposition KPIs", async () => {
    // Cycle A: IVF, advance to stimulating, then convert to IUI (poor response)
    const a = await cycles.createTreatmentCycle("doc-1", "ivf", "couple-1");
    if (!a.ok) throw new Error("a");
    for (const k of ["consent.ivf", "consent.anaesthesia", "consent.data_processing"]) await cycles.recordConsent("doc-1", a.value.id, k);
    await cycles.advanceStatus("doc-1", a.value.id, "stimulating");
    const conv = await cycles.convertCycle("doc-1", a.value.id, "iui", "converted_to_iui", "poor response on scan");
    expect(conv.ok).toBe(true);
    if (!conv.ok) return;
    expect(conv.value.source.status).toBe("cancelled");
    expect(conv.value.created.type).toBe("iui");

    // the new IUI cycle reloads with its conversion link intact
    const reloaded = await cycles.get(conv.value.created.id);
    expect(reloaded?.convertedFromId).toBe(a.value.id);

    // Cycles B, C: true cancellations (coded). Cycle D: stays active.
    const b = await cycles.createTreatmentCycle("doc-1", "icsi", "couple-2");
    const c = await cycles.createTreatmentCycle("doc-1", "ivf", "couple-3");
    await cycles.createTreatmentCycle("doc-1", "ivf", "couple-4");
    if (!b.ok || !c.ok) throw new Error("bc");
    expect((await cycles.cancel("doc-1", b.value.id, "poor_ovarian_response")).ok).toBe(true);
    expect((await cycles.cancel("doc-1", c.value.id, "patient_withdrew")).ok).toBe(true);

    // Disposition: 5 cycles started (A, the IUI, B, C, D); 2 true cancellations
    // (B, C — A is excluded as a conversion); 1 conversion (the IUI).
    const counts = await cycles.dispositionCounts();
    expect(counts).toMatchObject({ started: 5, cancelled: 2, converted: 1 });
    expect(counts.cancelledByCategory).toEqual({ poor_response: 1, patient_choice: 1 });

    const report = services.analytics.disposition(counts);
    expect(report.cancellationRate).toBeCloseTo(0.4, 5);
    expect(report.conversionRate).toBeCloseTo(0.2, 5);

    // the audit hash-chain (cancel + convert mutations) verifies intact
    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
