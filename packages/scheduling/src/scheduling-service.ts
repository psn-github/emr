import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, conflict, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { findConflicts } from "./conflict.js";
import { assertTransition } from "./status.js";
import type {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  AppointmentType,
  BilingualName,
  Resource,
  ResourceId,
  ResourceKind,
} from "./types.js";
import type { SchedulingStore } from "./store.js";

export interface BookInput {
  readonly typeId: AppointmentType["id"];
  readonly patientId: string;
  readonly practitionerId: ResourceId;
  readonly resourceIds: readonly ResourceId[];
  readonly start: string;
  readonly end: string;
}

/**
 * Multi-resource scheduling. Booking checks for resource/time conflicts, audits,
 * and emits events. Appointments carry a `patientId` (PHI) — RBAC is enforced at
 * the API (scheduling permission); this service records the audit trail.
 */
export class SchedulingService {
  constructor(
    private readonly store: SchedulingStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async addResource(kind: ResourceKind, name: BilingualName, opts: Partial<Pick<Resource, "level" | "locationRef">> = {}): Promise<Resource> {
    const resource: Resource = {
      id: newId<"Resource">(),
      kind,
      name,
      ...(opts.level ? { level: opts.level } : {}),
      ...(opts.locationRef ? { locationRef: opts.locationRef } : {}),
    };
    await this.store.saveResource(resource);
    return resource;
  }

  async addAppointmentType(
    name: BilingualName,
    durationMin: number,
    requiredResourceKinds: readonly ResourceKind[],
  ): Promise<AppointmentType> {
    const type: AppointmentType = { id: newId<"AppointmentType">(), name, durationMin, requiredResourceKinds };
    await this.store.saveAppointmentType(type);
    return type;
  }

  /** Book a slot — rejects on resource/time conflict. */
  async book(actorId: string, input: BookInput): Promise<Result<Appointment, AppError>> {
    const start = normalizeInstant(input.start);
    const end = normalizeInstant(input.end);
    if (start === null || end === null) {
      return err(validationError("invalid appointment date/time", "scheduling.bad_date"));
    }
    if (!(start < end)) {
      return err(validationError("appointment end must be after start", "scheduling.bad_interval"));
    }
    const resourceIds = dedupe([input.practitionerId, ...input.resourceIds]);
    const existing = await this.store.activeForResources(resourceIds);
    const clashes = findConflicts(existing, { resourceIds, start, end });
    if (clashes.length > 0) {
      return err(conflict("the slot conflicts with an existing booking", "scheduling.conflict"));
    }
    const appt: Appointment = {
      id: newId<"Appointment">(),
      typeId: input.typeId,
      patientId: input.patientId,
      practitionerId: input.practitionerId,
      resourceIds,
      start,
      end,
      status: "booked",
    };
    await this.store.saveAppointment(appt);
    await this.audit.record({ actorId, entityType: "Appointment", entityId: appt.id, action: "CREATE", after: { typeId: appt.typeId, patientId: appt.patientId, start: appt.start, end: appt.end } });
    await this.events.emit({ type: "AppointmentBooked", aggregateType: "Appointment", aggregateId: appt.id, data: { patientId: appt.patientId, start: appt.start } });
    return ok(appt);
  }

  private async transition(actorId: string, id: AppointmentId, to: AppointmentStatus, reason?: string): Promise<Result<Appointment, AppError>> {
    const appt = await this.store.getAppointment(id);
    if (appt === null) return err(notFound("appointment not found", "scheduling.not_found"));
    const allowed = assertTransition(appt.status, to);
    if (!allowed.ok) return err(allowed.error);
    const updated: Appointment = { ...appt, status: to, ...(reason ? { cancellationReason: reason } : {}) };
    await this.store.saveAppointment(updated);
    await this.audit.record({ actorId, entityType: "Appointment", entityId: id, action: "UPDATE", before: { status: appt.status }, after: { status: to, ...(reason ? { reason } : {}) } });
    await this.events.emit({ type: "AppointmentStatusChanged", aggregateType: "Appointment", aggregateId: id, data: { from: appt.status, to } });
    return ok(updated);
  }

  checkIn(actorId: string, id: AppointmentId): Promise<Result<Appointment, AppError>> {
    return this.transition(actorId, id, "checked_in");
  }
  start(actorId: string, id: AppointmentId): Promise<Result<Appointment, AppError>> {
    return this.transition(actorId, id, "in_progress");
  }
  complete(actorId: string, id: AppointmentId): Promise<Result<Appointment, AppError>> {
    return this.transition(actorId, id, "completed");
  }
  cancel(actorId: string, id: AppointmentId, reason: string): Promise<Result<Appointment, AppError>> {
    return this.transition(actorId, id, "cancelled", reason);
  }
  markNoShow(actorId: string, id: AppointmentId): Promise<Result<Appointment, AppError>> {
    return this.transition(actorId, id, "no_show");
  }

  list(): Promise<readonly Appointment[]> {
    return this.store.listAppointments();
  }
}

function dedupe(ids: readonly ResourceId[]): ResourceId[] {
  return [...new Set<ResourceId>(ids)];
}

/** Canonicalise an instant to ISO-with-ms (UTC), or null if unparseable. Keeps
 *  time comparisons consistent across the in-memory and Postgres stores. */
function normalizeInstant(value: string): string | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
