import type { ClinicalNote, Encounter, EncounterId, Letter, LetterId, NoteId, Order, OrderId, Result, ResultId } from "./types.js";

export interface ClinicalStore {
  saveEncounter(e: Encounter): Promise<void>;
  getEncounter(id: EncounterId): Promise<Encounter | null>;
  saveNote(n: ClinicalNote): Promise<void>;
  getNote(id: NoteId): Promise<ClinicalNote | null>;
  saveOrder(o: Order): Promise<void>;
  getOrder(id: OrderId): Promise<Order | null>;
  saveResult(r: Result): Promise<void>;
  getResult(id: ResultId): Promise<Result | null>;
  unacknowledgedResults(): Promise<readonly Result[]>;
  releasedResultsForPatient(patientId: string): Promise<readonly Result[]>;
  saveLetter(l: Letter): Promise<void>;
  getLetter(id: LetterId): Promise<Letter | null>;
}

export class InMemoryClinicalStore implements ClinicalStore {
  private readonly encounters = new Map<string, Encounter>();
  private readonly notes = new Map<string, ClinicalNote>();
  private readonly orders = new Map<string, Order>();
  private readonly results = new Map<string, Result>();
  private readonly letters = new Map<string, Letter>();

  async saveEncounter(e: Encounter): Promise<void> {
    this.encounters.set(e.id, e);
  }
  async getEncounter(id: EncounterId): Promise<Encounter | null> {
    return this.encounters.get(id) ?? null;
  }
  async saveNote(n: ClinicalNote): Promise<void> {
    this.notes.set(n.id, n);
  }
  async getNote(id: NoteId): Promise<ClinicalNote | null> {
    return this.notes.get(id) ?? null;
  }
  async saveOrder(o: Order): Promise<void> {
    this.orders.set(o.id, o);
  }
  async getOrder(id: OrderId): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
  async saveResult(r: Result): Promise<void> {
    this.results.set(r.id, r);
  }
  async getResult(id: ResultId): Promise<Result | null> {
    return this.results.get(id) ?? null;
  }
  async unacknowledgedResults(): Promise<readonly Result[]> {
    return [...this.results.values()].filter((r) => r.status === "unacknowledged");
  }
  async releasedResultsForPatient(patientId: string): Promise<readonly Result[]> {
    return [...this.results.values()].filter((r) => r.patientId === patientId && r.releasedToPatient);
  }
  async saveLetter(l: Letter): Promise<void> {
    this.letters.set(l.id, l);
  }
  async getLetter(id: LetterId): Promise<Letter | null> {
    return this.letters.get(id) ?? null;
  }
}
