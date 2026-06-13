import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { Couple, CoupleId } from "./couple.js";
import type { MarriageVerification } from "./marriage.js";
import type { Person, PersonId } from "./person.js";
import type { EncryptedValue } from "@oxford/crypto";
import type { RegistryStore } from "./store.js";
import type { DeathRecord } from "./vital-status.js";

/**
 * Postgres-backed RegistryStore. The Civil ID is persisted ONLY as its encrypted
 * envelope (`civil_id_enc`) — the plaintext never reaches this layer. Soft-delete
 * only (tombstone via `deleted_at`/`merged_into`); no row is ever removed.
 */
export class PgRegistryStore implements RegistryStore {
  constructor(private readonly pool: Pool) {}

  async savePerson(p: Person): Promise<void> {
    await this.pool.query(
      `INSERT INTO registry.person
         (id, name_ar, name_en, civil_id_enc, dob, sex, nationality, language_pref, phone, email, photo_ref, deleted_at, merged_into)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, civil_id_enc=EXCLUDED.civil_id_enc,
         dob=EXCLUDED.dob, sex=EXCLUDED.sex, nationality=EXCLUDED.nationality,
         language_pref=EXCLUDED.language_pref, phone=EXCLUDED.phone, email=EXCLUDED.email,
         photo_ref=EXCLUDED.photo_ref, deleted_at=EXCLUDED.deleted_at, merged_into=EXCLUDED.merged_into`,
      [
        p.id, p.name.ar, p.name.en, p.civilIdEnc, p.dob, p.sex, p.nationality, p.languagePref,
        p.contact.phone ?? null, p.contact.email ?? null, p.photoRef, p.deletedAt, p.mergedInto,
      ],
    );
  }

  async getPerson(id: PersonId): Promise<Person | null> {
    const res = await this.pool.query<PersonRow>(
      `SELECT id, name_ar, name_en, civil_id_enc, dob::text AS dob, sex, nationality,
              language_pref, phone, email, photo_ref, deleted_at, merged_into
       FROM registry.person WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? rowToPerson(row) : null;
  }

  async saveCouple(c: Couple): Promise<void> {
    await this.pool.query(
      `INSERT INTO registry.couple (id, husband_person_id, wife_person_id, marriage_verification_id, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         husband_person_id=EXCLUDED.husband_person_id, wife_person_id=EXCLUDED.wife_person_id,
         marriage_verification_id=EXCLUDED.marriage_verification_id, status=EXCLUDED.status`,
      [c.id, c.husbandPersonId, c.wifePersonId, c.marriageVerificationId, c.status],
    );
  }

  async getCouple(id: CoupleId): Promise<Couple | null> {
    const res = await this.pool.query<CoupleRow>(
      `SELECT id, husband_person_id, wife_person_id, marriage_verification_id, status
       FROM registry.couple WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? rowToCouple(row) : null;
  }

  async couplesReferencing(personId: PersonId): Promise<readonly Couple[]> {
    const res = await this.pool.query<CoupleRow>(
      `SELECT id, husband_person_id, wife_person_id, marriage_verification_id, status
       FROM registry.couple WHERE husband_person_id = $1 OR wife_person_id = $1`,
      [personId],
    );
    return res.rows.map(rowToCouple);
  }

  async saveMarriage(v: MarriageVerification): Promise<void> {
    await this.pool.query(
      `INSERT INTO registry.marriage_verification (id, couple_id, document_ref, verified_by, verified_at, method)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [v.id, v.coupleId, v.documentRef, v.verifiedBy, v.verifiedAt, v.method],
    );
  }

  async saveDeathRecord(d: DeathRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO registry.death_record (person_id, id, date_of_death, attested_by, document_ref, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (person_id) DO NOTHING`,
      [d.personId, d.id, d.dateOfDeath, d.attestedBy, d.documentRef, d.recordedAt],
    );
  }

  async getDeathRecord(personId: PersonId): Promise<DeathRecord | null> {
    const res = await this.pool.query<DeathRow>(
      `SELECT person_id, id, date_of_death::text AS date_of_death, attested_by, document_ref, recorded_at
       FROM registry.death_record WHERE person_id = $1`,
      [personId],
    );
    const row = res.rows[0];
    return row ? rowToDeath(row) : null;
  }
}

interface DeathRow {
  person_id: string; id: string; date_of_death: string; attested_by: string; document_ref: string; recorded_at: Date;
}
function rowToDeath(r: DeathRow): DeathRecord {
  return {
    id: asId<"DeathRecord">(r.id),
    personId: asId<"Person">(r.person_id),
    dateOfDeath: r.date_of_death,
    attestedBy: r.attested_by,
    documentRef: r.document_ref,
    recordedAt: new Date(r.recorded_at).toISOString(),
  };
}

interface PersonRow {
  id: string; name_ar: string; name_en: string; civil_id_enc: string; dob: string;
  sex: string; nationality: string; language_pref: string; phone: string | null;
  email: string | null; photo_ref: string | null; deleted_at: Date | null; merged_into: string | null;
}
interface CoupleRow {
  id: string; husband_person_id: string; wife_person_id: string;
  marriage_verification_id: string | null; status: string;
}

function rowToPerson(r: PersonRow): Person {
  return {
    id: asId<"Person">(r.id),
    name: { ar: r.name_ar, en: r.name_en },
    civilIdEnc: r.civil_id_enc as EncryptedValue,
    dob: r.dob,
    sex: r.sex as Person["sex"],
    nationality: r.nationality,
    languagePref: r.language_pref as Person["languagePref"],
    contact: { ...(r.phone ? { phone: r.phone } : {}), ...(r.email ? { email: r.email } : {}) },
    photoRef: r.photo_ref,
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
    mergedInto: r.merged_into ? asId<"Person">(r.merged_into) : null,
  };
}

function rowToCouple(r: CoupleRow): Couple {
  return {
    id: asId<"Couple">(r.id),
    husbandPersonId: asId<"Person">(r.husband_person_id),
    wifePersonId: asId<"Person">(r.wife_person_id),
    marriageVerificationId: r.marriage_verification_id ? asId<"MarriageVerification">(r.marriage_verification_id) : null,
    status: r.status as Couple["status"],
  };
}
