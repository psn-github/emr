import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, conflict } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { FacilityService } from "./facility-service.js";
import type { FlowStore } from "./flow-store.js";
import type {
  BedCapacity,
  BoardBed,
  BoardLocation,
  FlowBoard,
  LocationMovement,
  PatientFlowStatus,
  PatientLocation,
} from "./flow-types.js";
import type { BedId, FloorLevel, LocationNodeId } from "./types.js";

export interface MoveOptions {
  readonly bedId?: BedId;
  readonly reason?: string;
}

/**
 * Live patient-flow & bed board. Tracks where each patient is, records every
 * transfer as an audited movement event, and allocates beds through the audited
 * bed-status machine (so a bed can't be double-occupied). The board read model
 * carries location + status only — no clinical content (ADR-0013).
 */
export class FlowService {
  constructor(
    private readonly store: FlowStore,
    private readonly facility: FacilityService,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  /** Place/transfer a patient at a location node, optionally into a bed. */
  async moveTo(
    actorId: string,
    patientId: string,
    toNodeId: LocationNodeId,
    status: PatientFlowStatus,
    opts: MoveOptions = {},
  ): Promise<Result<PatientLocation, AppError>> {
    const prev = await this.store.getLocation(patientId);

    if (opts.bedId !== undefined) {
      // Capacity-safe: the bed must be FREE before we allocate it. (setBedStatus
      // treats occupied→occupied as a no-op, so we check explicitly here.)
      const target = await this.facility.getBed(opts.bedId);
      if (target === null) return err(notFound("bed not found", "facility.bed.not_found"));
      if (target.status !== "free") return err(conflict("bed is not free", "facility.bed.occupied"));
      // The bed is free, so free→occupied always succeeds (audited inside).
      await this.facility.setBedStatus(actorId, opts.bedId, "occupied");
    }
    // Release the previous bed (best-effort: occupied → cleaning).
    if (prev?.bedId && prev.bedId !== opts.bedId) {
      await this.facility.setBedStatus(actorId, prev.bedId, "cleaning");
    }

    const occurredAt = this.clock.now().toISOString();
    const movement: LocationMovement = {
      id: newId<"LocationMovement">(),
      patientId,
      fromNodeId: prev?.locationNodeId ?? null,
      toNodeId,
      bedId: opts.bedId ?? null,
      status,
      movedBy: actorId,
      occurredAt,
      ...(opts.reason ? { reason: opts.reason } : {}),
    };
    await this.store.saveMovement(movement);

    const location: PatientLocation = {
      patientId,
      locationNodeId: toNodeId,
      bedId: opts.bedId ?? null,
      status,
      sinceAt: occurredAt,
    };
    await this.store.saveLocation(location);

    await this.audit.record({
      actorId,
      entityType: "PatientLocation",
      entityId: patientId,
      action: "UPDATE",
      before: prev ? { node: prev.locationNodeId, status: prev.status } : null,
      after: { node: toNodeId, status },
    });
    await this.events.emit({
      type: "PatientMoved",
      aggregateType: "PatientLocation",
      aggregateId: patientId,
      data: { to: toNodeId, status },
    });
    return ok(location);
  }

  /** Discharge: free the bed and mark the patient discharged. */
  async discharge(actorId: string, patientId: string, reason?: string): Promise<Result<PatientLocation, AppError>> {
    const prev = await this.store.getLocation(patientId);
    if (prev === null) return err(notFound("patient is not on the flow board", "facility.flow.not_found"));
    if (prev.bedId) await this.facility.setBedStatus(actorId, prev.bedId, "cleaning");
    return this.moveTo(actorId, patientId, prev.locationNodeId, "discharged", reason ? { reason } : {});
  }

  currentLocation(patientId: string): Promise<PatientLocation | null> {
    return this.store.getLocation(patientId);
  }

  /** Audited transfer history for a patient (the journey through the building). */
  movements(patientId: string): Promise<readonly LocationMovement[]> {
    return this.store.listMovements(patientId);
  }

  /** The board — location + status + bed occupancy. No clinical content. */
  async board(): Promise<FlowBoard> {
    const current = (await this.store.listCurrent()).filter((l) => l.status !== "discharged");
    const beds = await this.facility.beds();
    const locations = await this.facility.locations();

    const levelByNode = new Map<string, FloorLevel>();
    for (const loc of locations) levelByNode.set(loc.id, loc.level);

    // Group patients by location node.
    const byNode = new Map<string, BoardLocation>();
    const patientByBed = new Map<string, string>();
    for (const loc of current) {
      const entry = byNode.get(loc.locationNodeId) ?? { locationNodeId: loc.locationNodeId, patients: [] };
      (entry.patients as { patientId: string; status: PatientFlowStatus; bedId: BedId | null }[]).push({
        patientId: loc.patientId,
        status: loc.status,
        bedId: loc.bedId,
      });
      byNode.set(loc.locationNodeId, entry);
      if (loc.bedId) patientByBed.set(loc.bedId, loc.patientId);
    }

    const boardBeds: BoardBed[] = beds.map((b) => ({
      bedId: b.id,
      label: b.label,
      status: b.status,
      patientId: patientByBed.get(b.id) ?? null,
    }));

    // Bed capacity per level.
    const cap = new Map<FloorLevel, { total: number; free: number; occupied: number }>();
    for (const b of beds) {
      const level = levelByNode.get(b.locationNodeId);
      if (level === undefined) continue;
      const c = cap.get(level) ?? { total: 0, free: 0, occupied: 0 };
      c.total += 1;
      if (b.status === "free") c.free += 1;
      if (b.status === "occupied") c.occupied += 1;
      cap.set(level, c);
    }
    const capacity: BedCapacity[] = [...cap.entries()].map(([level, c]) => ({ level, ...c }));

    return { locations: [...byNode.values()], beds: boardBeds, capacity };
  }
}
