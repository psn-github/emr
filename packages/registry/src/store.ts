import type { Couple, CoupleId } from "./couple.js";
import type { MarriageVerification } from "./marriage.js";
import type { Person, PersonId } from "./person.js";

/** Persistence boundary for the registry. The Postgres-backed implementation
 *  (Drizzle, schema `registry`) lands with DB wiring; the in-memory store backs
 *  the domain tests. Soft-delete only — nothing is ever removed. */
export interface RegistryStore {
  savePerson(person: Person): Promise<void>;
  getPerson(id: PersonId): Promise<Person | null>;
  saveCouple(couple: Couple): Promise<void>;
  getCouple(id: CoupleId): Promise<Couple | null>;
  couplesReferencing(personId: PersonId): Promise<readonly Couple[]>;
  saveMarriage(verification: MarriageVerification): Promise<void>;
}

export class InMemoryRegistryStore implements RegistryStore {
  private readonly persons = new Map<string, Person>();
  private readonly couples = new Map<string, Couple>();
  private readonly marriages = new Map<string, MarriageVerification>();

  async savePerson(person: Person): Promise<void> {
    this.persons.set(person.id, person);
  }
  async getPerson(id: PersonId): Promise<Person | null> {
    return this.persons.get(id) ?? null;
  }
  async saveCouple(couple: Couple): Promise<void> {
    this.couples.set(couple.id, couple);
  }
  async getCouple(id: CoupleId): Promise<Couple | null> {
    return this.couples.get(id) ?? null;
  }
  async couplesReferencing(personId: PersonId): Promise<readonly Couple[]> {
    return [...this.couples.values()].filter(
      (c) => c.husbandPersonId === personId || c.wifePersonId === personId,
    );
  }
  async saveMarriage(verification: MarriageVerification): Promise<void> {
    this.marriages.set(verification.id, verification);
  }
}
