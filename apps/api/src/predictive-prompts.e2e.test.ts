// P2 — PREDICTIVE PROMPTS, end-to-end on real Postgres. Proves: from the latest
// charted stimulation day's structured inputs (follicle sizes + E2), advisory
// prompts surface an expected oocyte-yield range and OHSS risk flags. ADVISORY
// only. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const CYCLE = "pp-cycle-1";

describe.skipIf(!DATABASE_URL)("P2 predictive prompts (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("surfaces an oocyte-yield range + OHSS risk from the latest charted day", async () => {
    // no charted days yet → advisory prompt is unavailable
    expect((await services.stim.predict(CYCLE)).ok).toBe(false);

    await services.stim.recordDay("nurse-1", CYCLE, { day: 6, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }], follicles: [{ ovary: "left", sizesMm: [11, 12] }], endocrine: { e2: 800 } });
    // latest day (9): 22 lead follicles + high E2 → high OHSS risk
    await services.stim.recordDay("nurse-1", CYCLE, {
      day: 9,
      drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }],
      follicles: [{ ovary: "left", sizesMm: Array(11).fill(13) }, { ovary: "right", sizesMm: Array(11).fill(14) }],
      endocrine: { e2: 4200 },
    });

    const p = await services.stim.predict(CYCLE);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.follicleCount).toBe(22);
    expect(p.value.leadFollicleCount).toBe(22);
    expect(p.value.expectedOocyteRange.max).toBeGreaterThanOrEqual(p.value.expectedOocyteRange.min);
    expect(p.value.ohssRisk).toBe("high");
    expect(p.value.ohssFlags).toEqual(["high_follicle_count", "high_e2"]);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
