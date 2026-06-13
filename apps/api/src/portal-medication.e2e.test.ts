// e2e — patient portal medication schedule + injection-teaching videos THROUGH
// the tRPC API on real Postgres (docs/01 §E13). Proves: an owned cycle's
// stimulation chart surfaces as a medication schedule with bilingual drug names
// + a teaching video per drug; own-cycle/own-data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const N = (en: string) => ({ ar: en, en });

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("portal medication schedule (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, fertility.cycle, fertility.stim_day, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("surfaces the stim chart as a medication schedule with teaching videos; own-cycle only", async () => {
    const actor = "doc-1";
    const husband = await services.registry.registerPerson(actor, { name: N("Ali"), civilId: "284010199001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const wife = await services.registry.registerPerson(actor, { name: N("Noura"), civilId: "288050199002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const couple = await services.registry.createCouple(actor, husband.id, wife.id);
    if (!couple.ok) throw new Error("couple");
    await services.registry.verifyMarriage(actor, couple.value.id, { documentRef: "m1", method: "certificate" });
    const cyc = await services.cycle.createTreatmentCycle(actor, "icsi", couple.value.id);
    if (!cyc.ok) throw new Error("cycle");
    // record two stim days
    await services.stim.recordDay(actor, cyc.value.id, { day: 1, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU", route: "SC" }] });
    await services.stim.recordDay(actor, cyc.value.id, { day: 2, drugs: [{ formularyItemId: "rfsh", dose: 225, unit: "IU" }, { formularyItemId: "gnrh_antagonist", dose: 0.25, unit: "mg" }] });

    const me = appRouter.createCaller({ session: null, patient: { patientId: wife.id }, services });
    const sched = await me.portal.medicationSchedule({ patientId: wife.id, cycleId: cyc.value.id });
    expect(sched.schedule).toHaveLength(2);
    const d1 = sched.schedule[0]!.drugs[0]!;
    expect(d1.name?.en).toBe("Recombinant FSH");
    expect(d1.teachingVideoRef).toBe("video:injection/rfsh");
    expect(sched.schedule[1]!.drugs.map((x) => x.formularyItemId)).toEqual(["rfsh", "gnrh_antagonist"]);

    // a stranger is not on the couple → FORBIDDEN
    const stranger = appRouter.createCaller({ session: null, patient: { patientId: "stranger-1" }, services });
    await expectCode(() => stranger.portal.medicationSchedule({ patientId: "stranger-1", cycleId: cyc.value.id }), "FORBIDDEN");
  });
});
