// P2 — AMH-NOMOGRAM DECISION SUPPORT, end-to-end via the assembled app. Proves:
// AMH-informed counselling (category + oocyte-yield band + flags) is available at
// point of care through the wired CycleService, and bad inputs are rejected.
// ADVISORY only — no persistence, no decision. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P2 AMH-nomogram counselling (e2e, assembled app)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("surfaces advisory counselling from AMH + age and guards bad inputs", () => {
    const poor = services.cycle.amhCounselling(0.6, 41);
    expect(poor.ok && poor.value.category).toBe("poor");
    expect(poor.ok && poor.value.counsellingFlags).toEqual(["low_prognosis_counselling", "advanced_maternal_age_counselling"]);

    const high = services.cycle.amhCounselling(5.0, 30);
    expect(high.ok && high.value.category).toBe("high");
    expect(high.ok && high.value.expectedOocyteRange).toEqual({ min: 15, max: 25 });
    expect(high.ok && high.value.counsellingFlags).toEqual(["ohss_precaution"]);

    expect(services.cycle.amhCounselling(-1, 30).ok).toBe(false);
  });
});
