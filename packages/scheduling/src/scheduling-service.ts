import type { Result, AppError } from "@oxford/core";
import { ok, err, asId, newId, notFound, conflict, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { findConflicts } from "./conflict.js";
import { assertTransition } from "./status.js";
import type {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  AppointmentType,
  AppointmentTypeId,
  BilingualName,
  Resource,
  ResourceId,
  ResourceKind,
} from "./types.js";
import type { SchedulingStore } from "./store.js";

/** Config input for a bookable resource (practitioner/room/scanner/theatre/kit).
 *  `id` is OPTIONAL and, when given, is the resource's STABLE config key — so
 *  re-applying the same configuration is an idempotent upsert, not a duplicate
 *  ("configuration is data", CLAUDE.md). Omit it and a fresh id is allocated. */
export interface ResourceInput {
  readonly id?: string;
  readonly kind: ResourceKind;
  readonly name: BilingualName;
  readonly level?: Resource["level"];
  readonly locationRef?: string;
}

/** Config input for an appointment type. Same stable-key upsert rule as
 *  ResourceInput; `prep` is the bilingual patient preparation instruction the
 *  appointment slip prints. */
export interface AppointmentTypeInput {
  readonly id?: string;
  readonly name: BilingualName;
  readonly durationMin: number;
  /** Omitted = no resource requirements (defaults to []). */
  readonly requiredResourceKinds?: readonly ResourceKind[];
  readonly prep?: BilingualName;
  readonly defaultBillingItem?: string;
}

const RESOURCE_KINDS: ReadonlySet<string> = new Set<ResourceKind>(["practitioner", "room", "scanner", "theatre", "equipment"]);

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

  /**
   * Define (or re-define) a bookable resource — VERSIONED CONFIG, audited. The
   * config surface behind the admin-gated router procedure; `addResource` stays
   * as the unaudited test/seed helper.
   */
  async defineResource(actorId: string, input: ResourceInput): Promise<Result<Resource, AppError>> {
    if (!RESOURCE_KINDS.has(input.kind)) {
      return err(validationError(`unknown resource kind '${input.kind}'`, "scheduling.resource.bad_kind"));
    }
    const named = assertBilingual(input.name, "scheduling.resource.bad_name");
    if (!named.ok) return err(named.error);
    const id = input.id !== undefined ? asId<"Resource">(input.id) : newId<"Resource">();
    const existing = await this.store.getResource(id);
    const resource: Resource = {
      id,
      kind: input.kind,
      name: input.name,
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.locationRef !== undefined ? { locationRef: input.locationRef } : {}),
    };
    await this.store.saveResource(resource);
    await this.audit.record({
      actorId,
      entityType: "Resource",
      entityId: id,
      action: existing === null ? "CREATE" : "UPDATE",
      ...(existing !== null ? { before: { kind: existing.kind, name: existing.name } } : {}),
      after: { kind: resource.kind, name: resource.name },
    });
    await this.events.emit({ type: "ResourceDefined", aggregateType: "Resource", aggregateId: id, data: { kind: resource.kind } });
    return ok(resource);
  }

  /**
   * Define (or re-define) an appointment type — VERSIONED CONFIG, audited.
   * Duration must be a positive whole number of minutes; the resource kinds it
   * requires must all be known kinds.
   */
  async defineAppointmentType(actorId: string, input: AppointmentTypeInput): Promise<Result<AppointmentType, AppError>> {
    const named = assertBilingual(input.name, "scheduling.appointment_type.bad_name");
    if (!named.ok) return err(named.error);
    if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) {
      return err(validationError("duration must be a positive whole number of minutes", "scheduling.appointment_type.bad_duration"));
    }
    const kinds = input.requiredResourceKinds ?? [];
    const unknown = kinds.find((k) => !RESOURCE_KINDS.has(k));
    if (unknown !== undefined) {
      return err(validationError(`unknown resource kind '${unknown}'`, "scheduling.resource.bad_kind"));
    }
    const id = input.id !== undefined ? asId<"AppointmentType">(input.id) : newId<"AppointmentType">();
    const existing = await this.store.getAppointmentType(id);
    const type: AppointmentType = {
      id,
      name: input.name,
      durationMin: input.durationMin,
      requiredResourceKinds: [...kinds],
      ...(input.prep !== undefined ? { prep: input.prep } : {}),
      ...(input.defaultBillingItem !== undefined ? { defaultBillingItem: input.defaultBillingItem } : {}),
    };
    await this.store.saveAppointmentType(type);
    await this.audit.record({
      actorId,
      entityType: "AppointmentType",
      entityId: id,
      action: existing === null ? "CREATE" : "UPDATE",
      ...(existing !== null ? { before: { name: existing.name, durationMin: existing.durationMin } } : {}),
      after: { name: type.name, durationMin: type.durationMin },
    });
    await this.events.emit({ type: "AppointmentTypeDefined", aggregateType: "AppointmentType", aggregateId: id, data: { durationMin: type.durationMin } });
    return ok(type);
  }

  /** All bookable resources (config read for the booking UI). */
  resources(): Promise<readonly Resource[]> {
    return this.store.listResources();
  }

  /** All appointment types (config read for the booking UI). */
  appointmentTypes(): Promise<readonly AppointmentType[]> {
    return this.store.listAppointmentTypes();
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

  /** Read an appointment by id (print/read model; caller enforces access). */
  appointment(id: AppointmentId): Promise<Appointment | null> {
    return this.store.getAppointment(id);
  }
  /** Read a resource (practitioner/room/etc.) by id — its bilingual name. */
  resource(id: ResourceId): Promise<Resource | null> {
    return this.store.getResource(id);
  }
  /** Read an appointment type (config) by id — its bilingual name + prep. */
  appointmentType(id: AppointmentTypeId): Promise<AppointmentType | null> {
    return this.store.getAppointmentType(id);
  }

  /** A patient's own appointments (portal read; caller enforces own-data). */
  async appointmentsForPatient(patientId: string): Promise<readonly Appointment[]> {
    return (await this.store.listAppointments()).filter((a) => a.patientId === patientId);
  }

  /** Active (resource-holding) appointments booked on a UTC calendar day
   *  (`dateIso` = YYYY-MM-DD). Feeds the records module's clinic pull list via a
   *  port — a read-only, additive surface (ADR-0065). */
  async appointmentsOn(dateIso: string): Promise<readonly Appointment[]> {
    const from = `${dateIso}T00:00:00.000Z`;
    const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();
    const inRange = await this.store.appointmentsInRange(from, to);
    return inRange.filter((a) => a.status === "booked" || a.status === "checked_in" || a.status === "in_progress");
  }
}

/** Bilingual config names are mandatory in BOTH languages (CLAUDE.md: no
 *  hardcoded user-facing strings — config carries en + ar). */
function assertBilingual(name: BilingualName | undefined, detailKey: string): Result<void, AppError> {
  if (name === undefined || name.en.trim() === "" || name.ar.trim() === "") {
    return err(validationError("a bilingual (en + ar) name is required", detailKey));
  }
  return ok(undefined);
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
