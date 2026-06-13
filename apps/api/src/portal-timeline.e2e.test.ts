// e2e — patient portal cycle timeline THROUGH the tRPC API on real Postgres
// (docs/01 §E13, ADR-0042). Proves: a couple member sees their cycle's "where am
// I / what's next" timeline; a non-member is FORBIDDEN (own-cycle only); a
// cross-patient request is FORBIDDEN (own-data only).
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

describe.skipIf(!DATABASE_URL)("patient portal cycle timeline (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE registry.person, registry.couple, registry.marriage_verification, fertility.cycle, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a couple member sees the cycle timeline; others are forbidden", async () => {
    const actor = "rec-1";
    const husband = await services.registry.registerPerson(actor, { name: N("Ali"), civilId: "284010199001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const wife = await services.registry.registerPerson(actor, { name: N("Noura"), civilId: "288050199002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const coupleR = await services.registry.createCouple(actor, husband.id, wife.id);
    if (!coupleR.ok) throw new Error("couple setup");
    await services.registry.verifyMarriage(actor, coupleR.value.id, { documentRef: "mrg-1", method: "certificate" });
    const cycleR = await services.cycle.createTreatmentCycle(actor, "icsi", coupleR.value.id);
    if (!cycleR.ok) throw new Error("cycle setup");
    const cycleId = cycleR.value.id;

    // the husband (a couple member) sees the timeline — at the planned stage
    const husbandCaller = appRouter.createCaller({ session: null, patient: { patientId: husband.id }, services });
    const t = await husbandCaller.portal.cycleTimeline({ patientId: husband.id, cycleId });
    expect(t.timeline.current).toBe("planned");
    expect(t.timeline.next).toBe("stimulating");
    expect(t.timeline.cancelled).toBe(false);

    // a stranger (own-data ok for themselves) is not on the couple → FORBIDDEN
    const stranger = appRouter.createCaller({ session: null, patient: { patientId: "stranger-1" }, services });
    await expectCode(() => stranger.portal.cycleTimeline({ patientId: "stranger-1", cycleId }), "FORBIDDEN");

    // the husband cannot request the timeline under the wife's id (own-data only)
    await expectCode(() => husbandCaller.portal.cycleTimeline({ patientId: wife.id, cycleId }), "FORBIDDEN");

    // an unknown cycle is NOT_FOUND
    await expectCode(() => husbandCaller.portal.cycleTimeline({ patientId: husband.id, cycleId: "ghost" }), "NOT_FOUND");
  });
});
