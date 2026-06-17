// P2 — BED-OCCUPANCY FORECAST, end-to-end on real Postgres. Proves: across the
// booked theatre list, the forecast aggregates per-day L2 bed reservations and
// flags days that would exceed the six L2 beds ("will the beds cover the coming
// days?"). Read-only over theatre_case. Runs where DATABASE_URL is set.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("P2 bed-occupancy forecast (e2e, real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  const insertCase = (id: string, date: string, hour: number) =>
    pool.query(
      `INSERT INTO perioperative.theatre_case (id, patient_id, procedure, theatre_resource_id, surgeon_resource_id, scheduled_date, start, end_at, status, appointment_ref)
       VALUES ($1,$2,'case','theatre-1','surgeon-1',$3,$4,$5,'scheduled',$6)`,
      [id, `pat-${id}`, date, `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`, `${date}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`, `appt-${id}`],
    );

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE perioperative.theatre_case");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("aggregates per-day L2 reservations and flags days over the six-bed capacity", async () => {
    // 7 cases on day 0 (> 6 L2 beds → exceeds), 1 on day 2, none on day 1
    for (let i = 0; i < 7; i += 1) await insertCase(`d0-${i}`, "2026-07-01", 8 + i);
    await insertCase("d2-0", "2026-07-03", 9);

    const r = await services.theatreScheduling.bedOccupancyForecast("2026-07-01", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.capacity).toBe(6);
    expect(r.value.entries.map((e) => e.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(r.value.entries.map((e) => e.reserved)).toEqual([7, 0, 1]);
    expect(r.value.entries.map((e) => e.exceedsBeds)).toEqual([true, false, false]);
    expect(r.value.daysExceeding).toBe(1);

    const integrity = await services.audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
