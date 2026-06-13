// e2e — discreet push notifications THROUGH the tRPC API on real Postgres (docs/01
// §E13, ADR-0041/0042). Proves: a patient registers a device; a dispatched push
// carries ONLY a discreet, no-PHI prompt; unregister stops delivery; own-data.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const PHI = /IVF|ICSI|embryo|pregnan|fertil|جنين|حمل/i;

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("discreet push (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE push.push_subscription, audit.audit_log");
    services = buildServices(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("registers a device, dispatches a discreet (no-PHI) push, and unregisters", async () => {
    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    await me.portal.registerPush({ patientId: "pat-1", endpoint: "https://push/device-a", locale: "ar" });

    // a dispatch (triggered server-side on events) sends only the discreet prompt
    const sent = await services.push.dispatch("system", "pat-1", "result_available");
    expect(sent).toBe(1);
    expect(services.pushOutbox.outbox).toHaveLength(1);
    const msg = services.pushOutbox.outbox[0]!;
    expect(msg.endpoint).toBe("https://push/device-a");
    expect(PHI.test(msg.title + " " + msg.body)).toBe(false); // NO PHI in the push
    expect(msg.body).toContain("بوابتك"); // the patient's locale (ar)

    // unregister → no further delivery
    expect((await me.portal.unregisterPush({ patientId: "pat-1", endpoint: "https://push/device-a" })).removed).toBe(true);
    expect(await services.push.dispatch("system", "pat-1", "payment_due")).toBe(0);
    expect(services.pushOutbox.outbox).toHaveLength(1); // unchanged
  });

  it("own-data: a patient cannot register a device under another patient's id", async () => {
    const me = appRouter.createCaller({ session: null, patient: { patientId: "pat-1" }, services });
    await expectCode(() => me.portal.registerPush({ patientId: "pat-2", endpoint: "https://push/x", locale: "en" }), "FORBIDDEN");
  });
});
