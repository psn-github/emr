// Integration: patient flow persists to Postgres (PHI: who is where). Runs where
// DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { FacilityService } from "./facility-service.js";
import { PgFacilityStore } from "./pg-store.js";
import { FlowService } from "./flow-service.js";
import { PgFlowStore } from "./flow-pg-store.js";
import { seedFacility } from "./seed.js";

const DATABASE_URL = process.env.DATABASE_URL;
const m1 = readFileSync(new URL("../migrations/0001_facility.sql", import.meta.url), "utf8");
const m2 = readFileSync(new URL("../migrations/0002_facility_flow.sql", import.meta.url), "utf8");

describe.skipIf(!DATABASE_URL)("PgFlowStore", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));

  beforeAll(async () => {
    await pool.query(m1);
    await pool.query(m2);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE facility.floor, facility.location_node, facility.bed, facility.patient_location, facility.location_movement");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("persists a patient into a bed and frees it on discharge", async () => {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const facility = new FacilityService(new PgFacilityStore(pool), audit, events);
    await seedFacility(facility);
    const flow = new FlowService(new PgFlowStore(pool), facility, audit, events, clock);

    const bed = (await facility.beds()).find((b) => b.label.startsWith("L2-"))!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });

    const raw = await pool.query<{ bed_id: string; status: string }>("SELECT bed_id, status FROM facility.patient_location WHERE patient_id = $1", ["pat-1"]);
    expect(raw.rows[0]!.bed_id).toBe(bed.id);

    await flow.discharge("nurse-1", "pat-1", "home");
    const bedRow = await pool.query<{ status: string }>("SELECT status FROM facility.bed WHERE id = $1", [bed.id]);
    expect(bedRow.rows[0]!.status).toBe("cleaning"); // released on discharge
  });
});
