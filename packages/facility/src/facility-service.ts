import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { assertTransition } from "./bed.js";
import type { Bed, BedId, BedStatus, BilingualName, Floor, FloorLevel, LocationNode, LocationNodeType } from "./types.js";
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

  async beds(): Promise<readonly Bed[]> {
    return this.store.listBeds();
  }
  async locations(): Promise<readonly LocationNode[]> {
    return this.store.listLocations();
  }
}
