import type { PartnerAccessGrant } from "./types.js";

export interface ConsentStore {
  saveGrant(g: PartnerAccessGrant): Promise<void>;
  /** The active (un-revoked) grant for a patient→partner pair, if any. */
  activeGrant(patientId: string, partnerId: string): Promise<PartnerAccessGrant | null>;
  /** A patient's grants (active + revoked) for display/management. */
  grantsForPatient(patientId: string): Promise<readonly PartnerAccessGrant[]>;
}

export class InMemoryConsentStore implements ConsentStore {
  private readonly grants: PartnerAccessGrant[] = [];

  async saveGrant(g: PartnerAccessGrant): Promise<void> {
    const idx = this.grants.findIndex((x) => x.id === g.id);
    if (idx >= 0) this.grants[idx] = g;
    else this.grants.push(g);
  }
  async activeGrant(patientId: string, partnerId: string): Promise<PartnerAccessGrant | null> {
    return this.grants.find((g) => g.patientId === patientId && g.partnerId === partnerId && g.revokedAt === null) ?? null;
  }
  async grantsForPatient(patientId: string): Promise<readonly PartnerAccessGrant[]> {
    return this.grants.filter((g) => g.patientId === patientId);
  }
}
