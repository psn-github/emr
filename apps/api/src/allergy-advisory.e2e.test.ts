// e2e — PRESCRIBE-TIME ALLERGY ADVISORY (docs/01 §E8, ADR-0060) against real
// Postgres, through the ASSEMBLED services (so the real clinical→fertility
// allergy port wired in context.ts is exercised). Proves: a coded patient drug
// allergy makes a matching prescription raise an advisory recorded on the
// stimulation day — WITHOUT blocking; a non-matching drug raises nothing; a
// retired allergy stops matching; the audit chain stays intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("§E8 prescribe-time allergy advisory (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE clinical.drug_allergy, fertility.stim_day");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("advises (does not block) when a prescribed drug class matches a recorded allergy", async () => {
    // The patient is allergic to recombinant FSH (gonadotropin_fsh class).
    await services.clinical.recordAllergy("doc-1", "pat-1", {
      drugClass: "gonadotropin_fsh",
      substance: { ar: "هرمون منبه للجريب", en: "Recombinant FSH" },
      severity: "severe",
      reaction: "urticaria",
    });

    // Prescribe rFSH (matches) + a GnRH antagonist (does not) for that patient.
    const r = await services.stim.recordDay("nurse-1", "cycle-1", {
      patientId: "pat-1",
      day: 1,
      drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }, { formularyItemId: "gnrh_antagonist", dose: 0.25, unit: "mg" }],
    });
    expect(r.ok).toBe(true); // ADVISORY — prescribing is never blocked
    if (!r.ok) return;
    expect(r.value.allergyWarnings).toEqual([{ formularyItemId: "rfsh", drugClass: "gonadotropin_fsh" }]);

    // The advisory is persisted on the stimulation day.
    const row = await pool.query<{ allergy_warnings: { formularyItemId: string; drugClass: string }[] }>(
      "SELECT allergy_warnings FROM fertility.stim_day WHERE cycle_id = $1 AND day = 1",
      ["cycle-1"],
    );
    expect(row.rows[0]!.allergy_warnings).toEqual([{ formularyItemId: "rfsh", drugClass: "gonadotropin_fsh" }]);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("raises no advisory once the allergy is retired (soft-delete stops matching)", async () => {
    const a = await services.clinical.recordAllergy("doc-1", "pat-2", {
      drugClass: "trigger",
      substance: { ar: "إبرة التفجير", en: "hCG trigger" },
      severity: "moderate",
    });
    expect((await services.clinical.retireAllergy("doc-1", a.id)).ok).toBe(true);

    const r = await services.stim.recordDay("nurse-1", "cycle-2", {
      patientId: "pat-2",
      day: 1,
      drugs: [{ formularyItemId: "hcg_trigger", dose: 250, unit: "mcg" }],
    });
    expect(r.ok && r.value.allergyWarnings).toEqual([]);
  });
});
