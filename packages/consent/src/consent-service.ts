import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { PartnerAccessGrant } from "./types.js";
import type { ConsentStore } from "./store.js";

/**
 * Consent-gated partner access (docs/01 §E13, ADR-0042). A patient grants another
 * person READ access to their portal data; the grant is revocable and every
 * grant/revoke is audited. `mayAccess` is the gate the portal consults — default
 * is no access. Granting access to oneself is meaningless and rejected.
 */
export class ConsentService {
  constructor(
    private readonly store: ConsentStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async grantPartnerAccess(actorId: string, patientId: string, partnerId: string): Promise<Result<PartnerAccessGrant, AppError>> {
    if (patientId === partnerId) return err(validationError("cannot grant access to oneself", "consent.partner.self"));
    const existing = await this.store.activeGrant(patientId, partnerId);
    if (existing !== null) return ok(existing); // idempotent
    const grant: PartnerAccessGrant = { id: newId<"PartnerAccessGrant">(), patientId, partnerId, grantedAt: this.clock.now().toISOString(), revokedAt: null };
    await this.store.saveGrant(grant);
    await this.audit.record({ actorId, entityType: "PartnerAccessGrant", entityId: grant.id, action: "CREATE", after: { patientId, partnerId } });
    await this.events.emit({ type: "PartnerAccessGranted", aggregateType: "PartnerAccessGrant", aggregateId: grant.id, data: { patientId, partnerId } });
    return ok(grant);
  }

  async revokePartnerAccess(actorId: string, patientId: string, partnerId: string): Promise<Result<void, AppError>> {
    const grant = await this.store.activeGrant(patientId, partnerId);
    if (grant === null) return err(validationError("no active grant to revoke", "consent.partner.no_grant"));
    await this.store.saveGrant({ ...grant, revokedAt: this.clock.now().toISOString() });
    await this.audit.record({ actorId, entityType: "PartnerAccessGrant", entityId: grant.id, action: "UPDATE", before: { revoked: false }, after: { revoked: true } });
    await this.events.emit({ type: "PartnerAccessRevoked", aggregateType: "PartnerAccessGrant", aggregateId: grant.id, data: { patientId, partnerId } });
    return ok(undefined);
  }

  /** The portal access gate: does `partnerId` currently have access to `patientId`? */
  async mayAccess(patientId: string, partnerId: string): Promise<boolean> {
    return (await this.store.activeGrant(patientId, partnerId)) !== null;
  }

  grantsForPatient(patientId: string): Promise<readonly PartnerAccessGrant[]> {
    return this.store.grantsForPatient(patientId);
  }
}
