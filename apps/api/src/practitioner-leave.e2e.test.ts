// P1 — PRACTITIONER LEAVE / CAPACITY, end-to-end on real Postgres. Proves: leave
// overrides the rota so an on-leave practitioner drops out of availability and the
// resource's effective capacity falls — with the audit chain intact.
// Runs where DATABASE_URL is set (CI provides it).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;
const WINDOW = { from: "2026-06-20T09:00:00.000Z", to: "2026-06-20T10:00:00.000Z" };
const DAY = { start: "2026-06-20T08:00:00.000Z", end: "2026-06-20T16:00:00.000Z" };

describe.skipIf(!DATABASE_URL)("P1 practitioner leave / capacity (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE hr.leave, hr.shift, hr.staff");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("leave overrides the rota: availability + capacity drop for the window", async () => {
    const a = await services.hr.registerStaff("hr-1", { name: "Dr A", role: "consultant" });
    const b = await services.hr.registerStaff("hr-1", { name: "Dr B", role: "consultant" });
    await services.hr.planShift("hr-1", { staffId: a.id, resourceId: "clinic-1", role: "lead", ...DAY });
    await services.hr.planShift("hr-1", { staffId: b.id, resourceId: "clinic-1", role: "lead", ...DAY });

    expect(await services.hr.capacity("clinic-1", WINDOW.from, WINDOW.to)).toBe(2);

    const lv = await services.hr.recordLeave("hr-1", { staffId: a.id, type: "annual", start: "2026-06-20T00:00:00.000Z", end: "2026-06-21T00:00:00.000Z", note: "family" });
    expect(lv.ok).toBe(true);

    expect(await services.hr.isOnLeave(a.id, WINDOW.from, WINDOW.to)).toBe(true);
    const avail = await services.hr.availability("clinic-1", WINDOW.from, WINDOW.to);
    expect(avail.map((s) => s.staffId)).toEqual([b.id]);
    expect(await services.hr.capacity("clinic-1", WINDOW.from, WINDOW.to)).toBe(1);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
