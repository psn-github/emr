// Integration: facility persists to Postgres (config data; no PHI). Runs where
// DATABASE_URL is set (CI provides it).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { FacilityService } from "./facility-service.js";
import { PgFacilityStore } from "./pg-store.js";
import { seedFacility } from "./seed.js";

const DATABASE_URL = process.env.DATABASE_URL;
const migration = readFileSync(new URL("../migrations/0001_facility.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgFacilityStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(migration);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("seeds the building and persists bed status changes", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const svc = new FacilityService(new PgFacilityStore(pool), audit, events);

    const seeded = await seedFacility(svc);
    expect(seeded.beds).toBe(9);

    const beds = await svc.beds();
    expect(beds).toHaveLength(9);

    const first = beds[0]!;
    await svc.setBedStatus("nurse-1", first.id, "occupied");
    const raw = await pool.query<{ status: string }>("SELECT status FROM facility.bed WHERE id = $1", [first.id]);
    expect(raw.rows[0]!.status).toBe("occupied");

    // re-applying the same topology on a populated database is a NO-OP: no
    // duplicate rows, and the occupied bed is not freed (idempotent config).
    const again = await seedFacility(svc);
    expect(again).toEqual({ locations: 0, beds: 0 });
    expect(await svc.beds()).toHaveLength(9);
    expect(await svc.locations()).toHaveLength(19);
    expect((await svc.floors()).map((f) => f.level).sort()).toEqual(["L1", "L2", "L3", "ground"]);
    expect((await svc.getBed(first.id))?.status).toBe("occupied");
  });
});
