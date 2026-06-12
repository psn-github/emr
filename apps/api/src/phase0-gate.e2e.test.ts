// CROSS-CUTTING e2e — the Phase 0 exit gate end-to-end, THROUGH THE tRPC API
// (auth middleware + domain services) against a real Postgres. Proves, in one
// flow: deny-by-default, the marriage hard-gate via the API, the audit chain,
// and the bilingual/RTL guarantee. Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertCatalogComplete, coreMessages, directionFor } from "@oxford/i18n";
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
const noPermission: Session = {
  sessionId: "s-non",
  subject: { staffId: "non-1", roles: [] },
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

describe.skipIf(!DATABASE_URL)("Phase 0 exit gate (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE audit.audit_log, registry.person, registry.couple, registry.marriage_verification");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("a no-permission user can do nothing; a wrong-domain role is denied", async () => {
    await expectCode(() => appRouter.createCaller({ session: noPermission, services }).embryology.read(), "FORBIDDEN");
    await expectCode(() => appRouter.createCaller({ session: reception, services }).embryology.read(), "FORBIDDEN");
  });

  it("blocks a fertility workflow without a verified marriage — then allows it once verified", async () => {
    const doc = appRouter.createCaller({ session: clinician, services });
    const h = await doc.registry.registerPerson({ name: { ar: "محمد", en: "Mohammed" }, civilId: "284010112345", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    const w = await doc.registry.registerPerson({ name: { ar: "سارة", en: "Sara" }, civilId: "286050167890", dob: "1986-05-01", sex: "female", nationality: "KW", languagePref: "ar" });
    const couple = await doc.registry.createCouple({ husbandPersonId: h.personId, wifePersonId: w.personId });

    // ATTACK via the API: start fertility with no marriage record → blocked.
    await expectCode(() => doc.fertility.startIntake({ coupleId: couple.coupleId }), "PRECONDITION_FAILED");

    await doc.registry.verifyMarriage({ coupleId: couple.coupleId, documentRef: "doc-1", method: "certificate" });
    const started = await doc.fertility.startIntake({ coupleId: couple.coupleId });
    expect(started).toEqual({ started: true });
  });

  it("the audit chain records every mutation + denial and verifies intact", async () => {
    const doc = appRouter.createCaller({ session: clinician, services });
    await doc.registry.registerPerson({ name: { ar: "أحمد", en: "Ahmed" }, civilId: "281010100000", dob: "1981-01-01", sex: "male", nationality: "KW", languagePref: "ar" });
    await expectCode(() => appRouter.createCaller({ session: noPermission, services }).embryology.read(), "FORBIDDEN");

    const entries = await services.audit.entries();
    expect(entries.length).toBeGreaterThanOrEqual(2); // CREATE + PERMISSION_DENIED
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });

  it("the bilingual catalog is complete and Arabic is RTL", () => {
    expect(() => assertCatalogComplete(coreMessages)).not.toThrow(); // zero untranslated strings
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("en")).toBe("ltr");
  });
});
