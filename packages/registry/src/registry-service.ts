import type { Clock, Result } from "@oxford/core";
import { ok, err, newId, notFound, validationError, AppError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { KeyProvider } from "@oxford/crypto";
import type { Couple, CoupleId } from "./couple.js";
import { assertMayStartFertility } from "./marriage.js";
import type { MarriageVerification } from "./marriage.js";
import type { Person, PersonId, RegisterPersonInput } from "./person.js";
import type { RegistryStore } from "./store.js";

const CIVIL_ID_AAD = "person.civil_id";

export interface VerifyMarriageInput {
  readonly documentRef: string;
  readonly method: string;
}

/**
 * Registry domain service. Owns Person / Couple / MarriageVerification. Every
 * mutation is audited (PR 0.1) and emits a domain event (PR 0.1 event log). The
 * Civil ID is encrypted via the KeyProvider seam (ADR-0012) and its plaintext
 * never enters a record, a log, or the audit before/after.
 */
export class RegistryService {
  constructor(
    private readonly store: RegistryStore,
    private readonly keys: KeyProvider,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async registerPerson(actorId: string, input: RegisterPersonInput): Promise<Person> {
    const civilIdEnc = await this.keys.encrypt(input.civilId, CIVIL_ID_AAD);
    const person: Person = {
      id: newId<"Person">(),
      name: input.name,
      civilIdEnc,
      dob: input.dob,
      sex: input.sex,
      nationality: input.nationality,
      languagePref: input.languagePref,
      contact: input.contact ?? {},
      photoRef: input.photoRef ?? null,
      deletedAt: null,
      mergedInto: null,
    };
    await this.store.savePerson(person);
    await this.audit.record({
      actorId,
      entityType: "Person",
      entityId: person.id,
      action: "CREATE",
      after: person, // contains civilIdEnc only — no plaintext
    });
    await this.events.emit({
      type: "PersonRegistered",
      aggregateType: "Person",
      aggregateId: person.id,
      data: { sex: person.sex, nationality: person.nationality },
    });
    return person;
  }

  async createCouple(
    actorId: string,
    husbandPersonId: PersonId,
    wifePersonId: PersonId,
  ): Promise<Result<Couple, AppError>> {
    if (husbandPersonId === wifePersonId) {
      return err(validationError("a couple needs two distinct people", "registry.couple.same_person"));
    }
    const husband = await this.store.getPerson(husbandPersonId);
    const wife = await this.store.getPerson(wifePersonId);
    if (husband === null || wife === null) {
      return err(notFound("both partners must be registered", "registry.couple.partner_missing"));
    }
    // Own-gametes-only is structural: husband contributes sperm, wife oocytes.
    if (husband.sex !== "male" || wife.sex !== "female") {
      return err(validationError("husband must be male and wife female", "registry.couple.roles"));
    }
    const couple: Couple = {
      id: newId<"Couple">(),
      husbandPersonId,
      wifePersonId,
      marriageVerificationId: null,
      status: "pending_verification",
    };
    await this.store.saveCouple(couple);
    await this.audit.record({
      actorId,
      entityType: "Couple",
      entityId: couple.id,
      action: "CREATE",
      after: couple,
    });
    await this.events.emit({
      type: "CoupleCreated",
      aggregateType: "Couple",
      aggregateId: couple.id,
      data: { husbandPersonId, wifePersonId },
    });
    return ok(couple);
  }

  async verifyMarriage(
    actorId: string,
    coupleId: CoupleId,
    input: VerifyMarriageInput,
  ): Promise<Result<Couple, AppError>> {
    const couple = await this.store.getCouple(coupleId);
    if (couple === null) return err(notFound("couple not found", "registry.couple.not_found"));
    if (couple.status === "dissolved") {
      return err(validationError("cannot verify a dissolved couple", "registry.couple.dissolved"));
    }
    const verification: MarriageVerification = {
      id: newId<"MarriageVerification">(),
      coupleId,
      documentRef: input.documentRef,
      verifiedBy: actorId,
      verifiedAt: this.clock.now().toISOString(),
      method: input.method,
    };
    await this.store.saveMarriage(verification);
    const updated: Couple = {
      ...couple,
      marriageVerificationId: verification.id,
      status: "verified",
    };
    await this.store.saveCouple(updated);
    await this.audit.record({
      actorId,
      entityType: "Couple",
      entityId: couple.id,
      action: "UPDATE",
      before: couple,
      after: updated,
    });
    await this.events.emit({
      type: "MarriageVerified",
      aggregateType: "Couple",
      aggregateId: couple.id,
      data: { verificationId: verification.id },
    });
    return ok(updated);
  }

  /** The server-side fertility gate. Loads the couple and applies the hard gate. */
  async canStartFertility(coupleId: CoupleId): Promise<Result<void, AppError>> {
    const couple = await this.store.getCouple(coupleId);
    if (couple === null) return err(notFound("couple not found", "registry.couple.not_found"));
    return assertMayStartFertility(couple);
  }

  /** Reveal a Civil ID (restricted, audited as a sensitive export). The value is
   *  returned to the caller but never logged or audited in clear. */
  async revealCivilId(actorId: string, personId: PersonId): Promise<Result<string, AppError>> {
    const person = await this.store.getPerson(personId);
    if (person === null) return err(notFound("person not found", "registry.person.not_found"));
    const decrypted = await this.keys.decrypt(person.civilIdEnc, CIVIL_ID_AAD);
    if (!decrypted.ok) {
      return err(new AppError("INTERNAL", "civil id could not be decrypted", "registry.person.civil_id_error"));
    }
    await this.audit.record({
      actorId,
      entityType: "Person",
      entityId: personId,
      action: "READ_EXPORT",
      after: { field: "civil_id" }, // the value is NOT recorded
    });
    return ok(decrypted.value);
  }

  /** Merge a duplicate person into a surviving one: repoint couple references,
   *  soft-delete (tombstone) the duplicate. Fully audited (de-dup tooling). */
  async mergePersons(
    actorId: string,
    survivingId: PersonId,
    duplicateId: PersonId,
  ): Promise<Result<void, AppError>> {
    if (survivingId === duplicateId) {
      return err(validationError("cannot merge a person into itself", "registry.merge.same_person"));
    }
    const surviving = await this.store.getPerson(survivingId);
    const duplicate = await this.store.getPerson(duplicateId);
    if (surviving === null || duplicate === null) {
      return err(notFound("both persons must exist", "registry.merge.missing"));
    }

    for (const couple of await this.store.couplesReferencing(duplicateId)) {
      const updated: Couple = {
        ...couple,
        husbandPersonId: couple.husbandPersonId === duplicateId ? survivingId : couple.husbandPersonId,
        wifePersonId: couple.wifePersonId === duplicateId ? survivingId : couple.wifePersonId,
      };
      await this.store.saveCouple(updated);
      await this.audit.record({
        actorId,
        entityType: "Couple",
        entityId: couple.id,
        action: "UPDATE",
        before: couple,
        after: updated,
      });
    }

    const tombstoned: Person = {
      ...duplicate,
      deletedAt: this.clock.now().toISOString(),
      mergedInto: survivingId,
    };
    await this.store.savePerson(tombstoned);
    await this.audit.record({
      actorId,
      entityType: "Person",
      entityId: duplicateId,
      action: "SOFT_DELETE",
      before: duplicate,
      after: tombstoned,
    });
    await this.events.emit({
      type: "PersonsMerged",
      aggregateType: "Person",
      aggregateId: survivingId,
      data: { survivingId, duplicateId },
    });
    return ok(undefined);
  }
}
