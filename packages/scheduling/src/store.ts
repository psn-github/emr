import type { Appointment, AppointmentId, AppointmentType, AppointmentTypeId, Resource, ResourceId } from "./types.js";

const ACTIVE: ReadonlySet<Appointment["status"]> = new Set(["booked", "checked_in", "in_progress"]);

export interface SchedulingStore {
  saveResource(r: Resource): Promise<void>;
  saveAppointmentType(t: AppointmentType): Promise<void>;
  saveAppointment(a: Appointment): Promise<void>;
  getAppointment(id: AppointmentId): Promise<Appointment | null>;
  getResource(id: ResourceId): Promise<Resource | null>;
  getAppointmentType(id: AppointmentTypeId): Promise<AppointmentType | null>;
  /** Active (resource-holding) appointments touching any of these resources. */
  activeForResources(resourceIds: readonly ResourceId[]): Promise<readonly Appointment[]>;
  /** Appointments whose start falls in the half-open instant range [from, to). */
  appointmentsInRange(fromIso: string, toIso: string): Promise<readonly Appointment[]>;
  listAppointments(): Promise<readonly Appointment[]>;
}

export class InMemorySchedulingStore implements SchedulingStore {
  private readonly resources = new Map<string, Resource>();
  private readonly types = new Map<string, AppointmentType>();
  private readonly appts = new Map<string, Appointment>();

  async saveResource(r: Resource): Promise<void> {
    this.resources.set(r.id, r);
  }
  async saveAppointmentType(t: AppointmentType): Promise<void> {
    this.types.set(t.id, t);
  }
  async saveAppointment(a: Appointment): Promise<void> {
    this.appts.set(a.id, a);
  }
  async getAppointment(id: AppointmentId): Promise<Appointment | null> {
    return this.appts.get(id) ?? null;
  }
  async getResource(id: ResourceId): Promise<Resource | null> {
    return this.resources.get(id) ?? null;
  }
  async getAppointmentType(id: AppointmentTypeId): Promise<AppointmentType | null> {
    return this.types.get(id) ?? null;
  }
  async activeForResources(resourceIds: readonly ResourceId[]): Promise<readonly Appointment[]> {
    const wanted = new Set<string>(resourceIds);
    return [...this.appts.values()].filter(
      (a) => ACTIVE.has(a.status) && a.resourceIds.some((r) => wanted.has(r)),
    );
  }
  async appointmentsInRange(fromIso: string, toIso: string): Promise<readonly Appointment[]> {
    return [...this.appts.values()].filter((a) => a.start >= fromIso && a.start < toIso);
  }
  async listAppointments(): Promise<readonly Appointment[]> {
    return [...this.appts.values()];
  }
}
