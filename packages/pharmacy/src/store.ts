import type { Prescription, PrescriptionId, PrescriptionStatus, TheatreDrugAdministration } from "./types.js";

/** Persistence seam for @oxford/pharmacy. Prescriptions and theatre-drug
 *  administrations are append-only records (a prescription's status advances by
 *  rewriting the same row; the audit log holds the who/what/when/before/after).
 *  `listPrescriptions` returns the ward's outstanding-scripts queue OLDEST FIRST
 *  (insertion order). */
export interface PharmacyStore {
  savePrescription(p: Prescription): Promise<void>;
  getPrescription(id: PrescriptionId): Promise<Prescription | null>;
  prescriptionsForEncounter(encounterId: string): Promise<readonly Prescription[]>;
  /** The outstanding-scripts queue, oldest first; optionally filtered to one status. */
  listPrescriptions(status?: PrescriptionStatus): Promise<readonly Prescription[]>;

  saveTheatreAdministration(a: TheatreDrugAdministration): Promise<void>;
  theatreAdministrationsForEncounter(encounterId: string): Promise<readonly TheatreDrugAdministration[]>;
}

export class InMemoryPharmacyStore implements PharmacyStore {
  private seq = 0;
  private readonly order = new Map<string, number>(); // prescription id -> insertion seq
  private readonly prescriptions = new Map<string, Prescription>();
  private readonly administrations: TheatreDrugAdministration[] = [];

  async savePrescription(p: Prescription): Promise<void> {
    if (!this.order.has(p.id)) this.order.set(p.id, ++this.seq);
    this.prescriptions.set(p.id, p);
  }
  async getPrescription(id: PrescriptionId): Promise<Prescription | null> {
    return this.prescriptions.get(id) ?? null;
  }
  async prescriptionsForEncounter(encounterId: string): Promise<readonly Prescription[]> {
    return this.sorted().filter((p) => p.encounterId === encounterId);
  }
  async listPrescriptions(status?: PrescriptionStatus): Promise<readonly Prescription[]> {
    const all = this.sorted();
    return status === undefined ? all : all.filter((p) => p.status === status);
  }

  async saveTheatreAdministration(a: TheatreDrugAdministration): Promise<void> {
    this.administrations.push(a);
  }
  async theatreAdministrationsForEncounter(encounterId: string): Promise<readonly TheatreDrugAdministration[]> {
    return this.administrations.filter((a) => a.encounterId === encounterId);
  }

  private sorted(): Prescription[] {
    return [...this.prescriptions.values()].sort((a, b) => (this.order.get(a.id) ?? 0) - (this.order.get(b.id) ?? 0));
  }
}
