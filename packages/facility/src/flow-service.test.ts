import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { FacilityService } from "./facility-service.js";
import { InMemoryFacilityStore } from "./store.js";
import { FlowService } from "./flow-service.js";
import { InMemoryFlowStore } from "./flow-store.js";
import { seedFacility } from "./seed.js";

async function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const facility = new FacilityService(new InMemoryFacilityStore(), audit, events);
  await seedFacility(facility);
  const flow = new FlowService(new InMemoryFlowStore(), facility, audit, events, clock);
  return { facility, flow, audit, events };
}

describe("FlowService", () => {
  it("admits, transfers into a bed, and records the audited movement", async () => {
    const { facility, flow, audit, events } = await build();
    const consult = (await facility.locations()).find((l) => l.type === "consult_room")!;
    const l2bed = (await facility.beds()).find((b) => b.label.startsWith("L2-"))!;

    // Admit on L3, then transfer to an L2 bed.
    await flow.moveTo("rec-1", "pat-1", consult.id, "in_consult");
    const moved = await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(l2bed.locationNodeId), "admitted", { bedId: l2bed.id });
    expect(moved.ok).toBe(true);

    const loc = await flow.currentLocation("pat-1");
    expect(loc!.bedId).toBe(l2bed.id);
    // bed now occupied
    expect((await facility.beds()).find((b) => b.id === l2bed.id)!.status).toBe("occupied");
    // movement audited + event emitted
    expect((await audit.entries()).some((e) => e.payload.entityType === "PatientLocation")).toBe(true);
    expect((await events.events()).some((e) => e.payload.type === "PatientMoved")).toBe(true);
  });

  it("is capacity-safe: cannot put a patient into an already-occupied bed", async () => {
    const { facility, flow } = await build();
    const bed = (await facility.beds())[0]!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    const second = await flow.moveTo("nurse-1", "pat-2", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    expect(second.ok).toBe(false); // bed not free → blocked
  });

  it("frees the bed on discharge and drops the patient from the board", async () => {
    const { facility, flow } = await build();
    const bed = (await facility.beds())[0]!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    const d = await flow.discharge("nurse-1", "pat-1", "home");
    expect(d.ok).toBe(true);
    const board = await flow.board();
    expect(board.locations.flatMap((l) => l.patients).some((p) => p.patientId === "pat-1")).toBe(false);
  });

  it("discharge reports not-found for an unknown patient", async () => {
    const { flow } = await build();
    expect((await flow.discharge("nurse-1", "ghost")).ok).toBe(false);
  });

  it("rejects a move into a non-existent bed", async () => {
    const { flow } = await build();
    const r = await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">("node-x"), "admitted", { bedId: asId<"Bed">("ghost-bed") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("records the patient's transfer history (the journey)", async () => {
    const { facility, flow } = await build();
    const consult = (await facility.locations()).find((l) => l.type === "consult_room")!;
    const bed = (await facility.beds()).find((b) => b.label.startsWith("L2-"))!;
    await flow.moveTo("rec-1", "pat-1", consult.id, "in_consult");
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    const history = await flow.movements("pat-1");
    expect(history.map((m) => m.status)).toEqual(["in_consult", "admitted"]);
  });

  it("discharges without a reason and the board ignores beds with an unknown location", async () => {
    const { facility, flow } = await build();
    const bed = (await facility.beds())[0]!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    // Discharge with no reason given.
    expect((await flow.discharge("nurse-1", "pat-1")).ok).toBe(true);
    // A stray bed whose location node isn't registered is skipped in capacity.
    await facility.addBed(asId<"LocationNode">("orphan-node"), "X1");
    const board = await flow.board();
    expect(board.capacity.some((c) => c.level === ("orphan" as never))).toBe(false);
  });

  it("board shows occupancy and capacity (location + status only)", async () => {
    const { facility, flow } = await build();
    const bed = (await facility.beds()).find((b) => b.label.startsWith("L2-"))!;
    await flow.moveTo("nurse-1", "pat-1", asId<"LocationNode">(bed.locationNodeId), "admitted", { bedId: bed.id });
    const board = await flow.board();

    const occupied = board.beds.find((b) => b.bedId === bed.id)!;
    expect(occupied.status).toBe("occupied");
    expect(occupied.patientId).toBe("pat-1");
    const l2 = board.capacity.find((c) => c.level === "L2")!;
    expect(l2.total).toBe(6);
    expect(l2.occupied).toBe(1);
    expect(l2.free).toBe(5);
    // Board entries carry only location/status fields — no clinical content.
    const entry = board.locations.flatMap((l) => l.patients)[0]!;
    expect(Object.keys(entry).sort()).toEqual(["bedId", "patientId", "status"]);
  });
});
