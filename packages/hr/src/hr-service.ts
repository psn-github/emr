import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Staff, Credential, CredentialType, Shift } from "./types.js";
import type { HrStore } from "./store.js";
import { credentialStatus, validateCredentialDates, validateShift, overlaps, type CredentialStatus } from "./hr.js";

export interface RegisterStaffInput {
  readonly name: string;
  readonly role: string;
  readonly professionalId?: string;
}
export interface AddCredentialInput {
  readonly staffId: string;
  readonly type: CredentialType;
  readonly name: string;
  readonly authority?: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}
export interface PlanShiftInput {
  readonly staffId: string;
  readonly resourceId: string;
  readonly start: string;
  readonly end: string;
  readonly role: string;
}
export interface CredentialAlert {
  readonly credentialId: string;
  readonly staffId: string;
  readonly type: CredentialType;
  readonly name: string;
  readonly expiresAt: string;
  readonly status: CredentialStatus;
}
export interface CredentialAlerts {
  readonly expired: readonly CredentialAlert[];
  readonly expiring: readonly CredentialAlert[];
}

/**
 * Light HR (docs/01 §E14, ADR-0040): staff registry, MOH licence + competency
 * records with **expiry tracking + due/overdue alerts**, and rota shifts that
 * feed scheduling resource availability. Competency currency MAY inform (never
 * silently blocks) witnessing eligibility — any hard gate is an explicit config
 * rule elsewhere. Full payroll stays external.
 */
export class HrService {
  constructor(
    private readonly store: HrStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async registerStaff(actorId: string, input: RegisterStaffInput): Promise<Staff> {
    const s: Staff = { id: newId<"Staff">(), name: input.name, role: input.role, professionalId: input.professionalId ?? null, active: true };
    await this.store.saveStaff(s);
    await this.audit.record({ actorId, entityType: "Staff", entityId: s.id, action: "CREATE", after: { name: s.name, role: s.role } });
    await this.events.emit({ type: "StaffRegistered", aggregateType: "Staff", aggregateId: s.id, data: { role: s.role } });
    return s;
  }

  async addCredential(actorId: string, input: AddCredentialInput): Promise<Result<Credential, AppError>> {
    const staff = await this.store.getStaff(asId<"Staff">(input.staffId));
    if (staff === null) return err(notFound("staff not found", "hr.staff.not_found"));
    const dates = validateCredentialDates(input.issuedAt, input.expiresAt);
    if (!dates.ok) return err(dates.error);
    const c: Credential = { id: newId<"Credential">(), staffId: input.staffId, type: input.type, name: input.name, authority: input.authority ?? null, issuedAt: input.issuedAt, expiresAt: input.expiresAt };
    await this.store.saveCredential(c);
    await this.audit.record({ actorId, entityType: "Credential", entityId: c.id, action: "CREATE", after: { staffId: input.staffId, type: input.type, name: input.name, expiresAt: input.expiresAt } });
    return ok(c);
  }

  /** Licence/competency expiry alerts across all staff as of `asOf`. */
  async credentialAlerts(asOf: Date, withinDays: number): Promise<CredentialAlerts> {
    const all = await this.store.allCredentials();
    const expired: CredentialAlert[] = [];
    const expiring: CredentialAlert[] = [];
    for (const c of all) {
      const status = credentialStatus(c.expiresAt, asOf, withinDays);
      const alert: CredentialAlert = { credentialId: c.id, staffId: c.staffId, type: c.type, name: c.name, expiresAt: c.expiresAt, status };
      if (status === "expired") expired.push(alert);
      else if (status === "expiring") expiring.push(alert);
    }
    return { expired, expiring };
  }

  /** Whether a named competency/licence is currently valid (informational — does
   *  NOT itself block; ADR-0040). True only if a matching credential is unexpired. */
  async isCredentialCurrent(staffId: string, name: string, asOf: Date): Promise<boolean> {
    const creds = await this.store.credentialsForStaff(staffId);
    return creds.some((c) => c.name === name && credentialStatus(c.expiresAt, asOf, 0) !== "expired");
  }

  async planShift(actorId: string, input: PlanShiftInput): Promise<Result<Shift, AppError>> {
    const staff = await this.store.getStaff(asId<"Staff">(input.staffId));
    if (staff === null) return err(notFound("staff not found", "hr.staff.not_found"));
    const valid = validateShift(input.start, input.end);
    if (!valid.ok) return err(valid.error);
    const s: Shift = { id: newId<"Shift">(), staffId: input.staffId, resourceId: input.resourceId, start: input.start, end: input.end, role: input.role };
    await this.store.saveShift(s);
    await this.audit.record({ actorId, entityType: "Shift", entityId: s.id, action: "CREATE", after: { staffId: input.staffId, resourceId: input.resourceId, start: input.start, end: input.end } });
    await this.events.emit({ type: "ShiftPlanned", aggregateType: "Shift", aggregateId: s.id, data: { resourceId: input.resourceId } });
    return ok(s);
  }

  /** Rota → scheduling: the shifts staffing a resource that overlap a window. */
  async availability(resourceId: string, from: string, to: string): Promise<readonly Shift[]> {
    const shifts = await this.store.shiftsForResource(resourceId);
    return shifts.filter((s) => overlaps(s.start, s.end, from, to));
  }

  listStaff(): Promise<readonly Staff[]> {
    return this.store.staff();
  }
  credentials(staffId: string): Promise<readonly Credential[]> {
    return this.store.credentialsForStaff(staffId);
  }
}
