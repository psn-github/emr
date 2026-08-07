import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertTransition } from "./bed.js";
import type { Bed, BedId, BedStatus, BilingualName, Floor, FloorLevel, LocationNode, LocationNodeType, TopologyResult, TopologySpec } from "./types.js";
import type { FacilityStore } from "./store.js";

// Facility configuration + bed-status operations. Bed-status changes are audited
// and emit a domain event the flow board (PR 1.3) reacts to. No PHI here — this
// is the building model; patient location lives in the flow-board module.
export class FacilityService {
  constructor(
    private readonly store: FacilityStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async addFloor(level: FloorLevel, name: BilingualName): Promise<Floor> {
    const floor: Floor = { id: newId<"Floor">(), level, name };
    await this.store.saveFloor(floor);
    return floor;
  }

  async addLocation(level: FloorLevel, type: LocationNodeType, name: BilingualName, capacity: number): Promise<LocationNode> {
    const node: LocationNode = { id: newId<"LocationNode">(), level, type, name, capacity };
    await this.store.saveLocation(node);
    return node;
  }

  async addBed(locationNodeId: LocationNode["id"], label: string, status: BedStatus = "free"): Promise<Bed> {
    const bed: Bed = { id: newId<"Bed">(), locationNodeId, label, status };
    await this.store.saveBed(bed);
    return bed;
  }

  /** Change a bed's status (free/occupied/cleaning/blocked) with transition rules,
   *  audit, and a domain event. */
  async setBedStatus(actorId: string, bedId: BedId, to: BedStatus): Promise<Result<Bed, AppError>> {
    const bed = await this.store.getBed(bedId);
    if (bed === null) return err(notFound("bed not found", "facility.bed.not_found"));
    const allowed = assertTransition(bed.status, to);
    if (!allowed.ok) return err(allowed.error);

    const updated: Bed = { ...bed, status: to };
    await this.store.saveBed(updated);
    await this.audit.record({
      actorId,
      entityType: "Bed",
      entityId: bedId,
      action: "UPDATE",
      before: { status: bed.status },
      after: { status: to },
    });
    await this.events.emit({
      type: "BedStatusChanged",
      aggregateType: "Bed",
      aggregateId: bedId,
      data: { from: bed.status, to },
    });
    return ok(updated);
  }

  getBed(id: BedId): Promise<Bed | null> {
    return this.store.getBed(id);
  }

  /** Complete housekeeping turnaround on a vacated bed (cleaning → free) — the
   *  audited step that returns a bed to the available pool. Only a `cleaning`
   *  bed can be turned around. */
  async completeTurnaround(actorId: string, bedId: BedId): Promise<Result<Bed, AppError>> {
    const bed = await this.store.getBed(bedId);
    if (bed === null) return err(notFound("bed not found", "facility.bed.not_found"));
    if (bed.status !== "cleaning") {
      return err(validationError("only a cleaning bed can be turned around", "facility.bed.not_cleaning"));
    }
    return this.setBedStatus(actorId, bedId, "free");
  }

  /** Beds awaiting housekeeping turnaround (vacated, not yet free). */
  async bedsAwaitingTurnaround(): Promise<readonly Bed[]> {
    return (await this.store.listBeds()).filter((b) => b.status === "cleaning");
  }

  async beds(): Promise<readonly Bed[]> {
    return this.store.listBeds();
  }
  async locations(): Promise<readonly LocationNode[]> {
    return this.store.listLocations();
  }
  async floors(): Promise<readonly Floor[]> {
    return this.store.listFloors();
  }

  /**
   * Apply a building topology (CONFIGURATION DATA) — the admin surface behind
   * the router's `facility.applyTopology`. **Idempotent**: a floor is matched by
   * its level, a location by (level, type, English name) and a bed by its label,
   * and only MISSING entities are created. Nothing existing is overwritten — in
   * particular a bed's STATUS is never reset, so re-applying the topology can
   * never free an occupied bed. One audit entry records what the run created.
   */
  async applyTopology(actorId: string, spec: TopologySpec): Promise<TopologyResult> {
    const [floors, locations, beds] = await Promise.all([this.store.listFloors(), this.store.listLocations(), this.store.listBeds()]);
    const floorLevels = new Set(floors.map((f) => f.level));
    const locationKeys = new Set(locations.map(locationKey));
    const bedLabels = new Set(beds.map((b) => b.label));

    let floorsCreated = 0;
    let locationsCreated = 0;
    let bedsCreated = 0;

    for (const f of spec.floors) {
      if (floorLevels.has(f.level)) continue;
      await this.addFloor(f.level, f.name);
      floorLevels.add(f.level);
      floorsCreated += 1;
    }

    for (const l of spec.locations) {
      const key = locationKey(l);
      let node = locations.find((n) => locationKey(n) === key) ?? null;
      if (node === null && !locationKeys.has(key)) {
        node = await this.addLocation(l.level, l.type, l.name, l.capacity);
        locationKeys.add(key);
        locationsCreated += 1;
      }
      if (node === null) continue;
      for (const label of l.beds ?? []) {
        if (bedLabels.has(label)) continue;
        await this.addBed(node.id, label);
        bedLabels.add(label);
        bedsCreated += 1;
      }
    }

    const created = { floors: floorsCreated, locations: locationsCreated, beds: bedsCreated };
    const totals = { floors: floorLevels.size, locations: locationKeys.size, beds: bedLabels.size };
    // A no-op re-apply mutates nothing, so it writes nothing: the audit log
    // records mutations, and re-running configuration must stay clean.
    if (floorsCreated + locationsCreated + bedsCreated > 0) {
      await this.audit.record({ actorId, entityType: "FacilityTopology", entityId: "topology", action: "CREATE", after: { created, totals } });
      await this.events.emit({ type: "FacilityTopologyApplied", aggregateType: "FacilityTopology", aggregateId: "topology", data: created });
    }
    return { created, totals };
  }
}

/** Identity of a location in the topology spec: level + type + English name. */
function locationKey(l: { level: FloorLevel; type: LocationNodeType; name: BilingualName }): string {
  return `${l.level}|${l.type}|${l.name.en}`;
}
