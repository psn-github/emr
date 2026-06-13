import type { SemenAnalysis, SpermPrep, SpermFreeze, SurgicalRetrieval } from "./types.js";

export interface AndrologyStore {
  saveAnalysis(a: SemenAnalysis): Promise<void>;
  analysesForPatient(patientId: string): Promise<readonly SemenAnalysis[]>;
  savePrep(p: SpermPrep): Promise<void>;
  prepsForPatient(patientId: string): Promise<readonly SpermPrep[]>;
  saveFreeze(f: SpermFreeze): Promise<void>;
  freezesForPatient(patientId: string): Promise<readonly SpermFreeze[]>;
  saveRetrieval(r: SurgicalRetrieval): Promise<void>;
  retrievalsForPatient(patientId: string): Promise<readonly SurgicalRetrieval[]>;
}

export class InMemoryAndrologyStore implements AndrologyStore {
  private readonly analyses: SemenAnalysis[] = [];
  private readonly preps: SpermPrep[] = [];
  private readonly freezes: SpermFreeze[] = [];
  private readonly retrievals: SurgicalRetrieval[] = [];

  async saveAnalysis(a: SemenAnalysis): Promise<void> {
    this.analyses.push(a);
  }
  async analysesForPatient(patientId: string): Promise<readonly SemenAnalysis[]> {
    return this.analyses.filter((a) => a.patientId === patientId);
  }
  async savePrep(p: SpermPrep): Promise<void> {
    this.preps.push(p);
  }
  async prepsForPatient(patientId: string): Promise<readonly SpermPrep[]> {
    return this.preps.filter((p) => p.patientId === patientId);
  }
  async saveFreeze(f: SpermFreeze): Promise<void> {
    this.freezes.push(f);
  }
  async freezesForPatient(patientId: string): Promise<readonly SpermFreeze[]> {
    return this.freezes.filter((f) => f.patientId === patientId);
  }
  async saveRetrieval(r: SurgicalRetrieval): Promise<void> {
    this.retrievals.push(r);
  }
  async retrievalsForPatient(patientId: string): Promise<readonly SurgicalRetrieval[]> {
    return this.retrievals.filter((r) => r.patientId === patientId);
  }
}
