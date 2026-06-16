import type { AntenatalVisit, Pregnancy, PregnancyId } from "./types.js";

export interface AntenatalStore {
  savePregnancy(p: Pregnancy): Promise<void>;
  getPregnancy(id: PregnancyId): Promise<Pregnancy | null>;
  activePregnancyForPatient(patientId: string): Promise<Pregnancy | null>;
  saveVisit(v: AntenatalVisit): Promise<void>;
  visitsForPregnancy(pregnancyId: PregnancyId): Promise<readonly AntenatalVisit[]>;
}

export class InMemoryAntenatalStore implements AntenatalStore {
  private readonly pregnancies = new Map<string, Pregnancy>();
  private readonly visits: AntenatalVisit[] = [];

  async savePregnancy(p: Pregnancy): Promise<void> {
    this.pregnancies.set(p.id, p);
  }
  async getPregnancy(id: PregnancyId): Promise<Pregnancy | null> {
    return this.pregnancies.get(id) ?? null;
  }
  async activePregnancyForPatient(patientId: string): Promise<Pregnancy | null> {
    return [...this.pregnancies.values()].find((p) => p.patientId === patientId && p.status === "active") ?? null;
  }
  async saveVisit(v: AntenatalVisit): Promise<void> {
    this.visits.push(v);
  }
  async visitsForPregnancy(pregnancyId: PregnancyId): Promise<readonly AntenatalVisit[]> {
    return this.visits.filter((v) => v.pregnancyId === pregnancyId).sort((a, b) => a.visitAt.localeCompare(b.visitAt));
  }
}
