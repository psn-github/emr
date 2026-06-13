// ADVERSARIAL SELF-REVIEW (PHI location) — the flow board reveals where a
// patient is (PHI), so it must be permission-gated; and it must carry NO
// clinical content (reception sees location/status only, ADR-0013). Prove both.
import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { Authorizer, type Session } from "@oxford/identity";
import { FacilityService } from "./facility-service.js";
import { InMemoryFacilityStore } from "./store.js";
import { FlowService } from "./flow-service.js";
import { InMemoryFlowStore } from "./flow-store.js";
import { seedFacility } from "./seed.js";

const session = (perms: string[], mfa: boolean): Session => ({
  sessionId: "s", subject: { staffId: "u", roles: [{ id: "r", name: "r", permissions: perms as Session["subject"]["roles"][number]["permissions"] }] }, mfa,
});

describe("ADVERSARIAL: flow board is PHI-location-gated and clinical-free", () => {
  it("a no-permission user is denied the board; reception (scheduling) is allowed", async () => {
    const authz = new Authorizer(new AuditLog(new InMemoryChainStore<AuditPayload>(), fixedClock(new Date("2026-06-13T08:00:00Z"))));
    const denied = await authz.authorize(session([], false), "scheduling:flowboard.read");
    console.log("[attack] no-permission user → flow board:", denied.ok ? "ALLOWED (FAIL)" : "DENIED");
    expect(denied.ok).toBe(false);
    expect((await authz.authorize(session(["scheduling:*"], false), "scheduling:flowboard.read")).ok).toBe(true);
  });

  it("the board structurally carries no clinical content", async () => {
    const clock = fixedClock(new Date("2026-06-13T08:00:00Z"));
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const facility = new FacilityService(new InMemoryFacilityStore(), audit, events);
    await seedFacility(facility);
    const flow = new FlowService(new InMemoryFlowStore(), facility, audit, events, clock);
    const bed = (await facility.beds())[0]!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });

    const board = await flow.board();
    const serialized = JSON.stringify(board);
    // Only ids, location, bed, status — no clinical vocabulary.
    expect(serialized).not.toMatch(/note|result|diagnosis|cycle|embryo|medication|allerg/i);
    const entry = board.locations.flatMap((l) => l.patients)[0]!;
    expect(Object.keys(entry).sort()).toEqual(["bedId", "patientId", "status"]);
  });
});
