// e2e — light HR THROUGH the tRPC API on real Postgres (docs/01 §E14, ADR-0040).
// Proves: staff registry; licence/competency expiry alerts (expired vs expiring);
// rota shifts feeding scheduling availability (overlap); RBAC by the HR domain.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hrAdmin: Session = { sessionId: "s-hr", subject: { staffId: "hr-1", roles: [{ id: "hr", name: "hr", permissions: ["hr:staff.read", "hr:staff.write", "hr:rota.read", "hr:rota.write"] }] }, mfa: true };
const reception: Session = { sessionId: "s-rec", subject: { staffId: "rec-1", roles: [{ id: "reception", name: "reception", permissions: ["scheduling:*"] }] }, mfa: false };

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("light HR (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let hr: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE hr.staff, hr.credential, hr.shift");
    services = buildServices(pool);
    hr = appRouter.createCaller({ session: hrAdmin, patient: null, services });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("registers staff, alerts on licence/competency expiry, and plans rota → availability", async () => {
    const { staffId } = await hr.hr.registerStaff({ name: "Dr Salem", role: "embryologist", professionalId: "MOH-123" });
    await hr.hr.addCredential({ staffId, type: "licence", name: "MOH licence", authority: "MOH", issuedAt: "2025-01-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" }); // valid
    await hr.hr.addCredential({ staffId, type: "competency", name: "Witnessing", issuedAt: "2025-06-01T00:00:00Z", expiresAt: "2026-07-05T00:00:00Z" }); // expiring
    await hr.hr.addCredential({ staffId, type: "competency", name: "ICSI", issuedAt: "2024-01-01T00:00:00Z", expiresAt: "2026-06-10T00:00:00Z" }); // expired

    const alerts = await hr.hr.credentialAlerts({ asOf: "2026-06-20T00:00:00Z", withinDays: 30 });
    expect(alerts.expired.map((a) => a.name)).toEqual(["ICSI"]);
    expect(alerts.expiring.map((a) => a.name)).toEqual(["Witnessing"]);
    expect((await hr.hr.listStaff()).staff).toHaveLength(1);

    // rota: a shift staffing theatre-1 feeds availability for an overlapping window
    await hr.hr.planShift({ staffId, resourceId: "theatre-1", start: "2026-06-20T08:00:00Z", end: "2026-06-20T16:00:00Z", role: "lead" });
    expect((await hr.hr.availability({ resourceId: "theatre-1", from: "2026-06-20T09:00:00Z", to: "2026-06-20T10:00:00Z" })).shifts).toHaveLength(1);
    expect((await hr.hr.availability({ resourceId: "theatre-1", from: "2026-06-21T09:00:00Z", to: "2026-06-21T10:00:00Z" })).shifts).toHaveLength(0);
  });

  it("RBAC: a non-HR role cannot manage staff or rota", async () => {
    const rec = appRouter.createCaller({ session: reception, patient: null, services });
    await expectCode(() => rec.hr.listStaff(), "FORBIDDEN");
    await expectCode(() => rec.hr.planShift({ staffId: "x", resourceId: "r", start: "2026-06-20T08:00:00Z", end: "2026-06-20T16:00:00Z", role: "x" }), "FORBIDDEN");
  });
});
