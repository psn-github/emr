import type { Pool } from "pg";
import { asId } from "@oxford/core";
import type { ClinicalNote, DrugAllergy, DrugAllergyId, Encounter, EncounterId, Letter, LetterId, NoteId, NoteVersion, Order, OrderId, Result, ResultId } from "./types.js";
import type { ClinicalStore } from "./store.js";

/** Postgres-backed ClinicalStore (all PHI). */
export class PgClinicalStore implements ClinicalStore {
  constructor(private readonly pool: Pool) {}

  async saveEncounter(e: Encounter): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.encounter (id, patient_id, type, practitioner_id, status, opened_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, closed_at=EXCLUDED.closed_at`,
      [e.id, e.patientId, e.type, e.practitionerId, e.status, e.openedAt, e.closedAt],
    );
  }
  async getEncounter(id: EncounterId): Promise<Encounter | null> {
    const r = await this.pool.query<EncRow>("SELECT * FROM clinical.encounter WHERE id = $1", [id]);
    return r.rows[0] ? encFrom(r.rows[0]) : null;
  }

  async saveNote(n: ClinicalNote): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.clinical_note (id, encounter_id, patient_id, versions) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET versions=EXCLUDED.versions`,
      [n.id, n.encounterId, n.patientId, JSON.stringify(n.versions)],
    );
  }
  async getNote(id: NoteId): Promise<ClinicalNote | null> {
    const r = await this.pool.query<NoteRow>("SELECT * FROM clinical.clinical_note WHERE id = $1", [id]);
    return r.rows[0] ? noteFrom(r.rows[0]) : null;
  }

  async saveOrder(o: Order): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.clinical_order (id, encounter_id, patient_id, kind, code, status, ordered_by, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status`,
      [o.id, o.encounterId, o.patientId, o.kind, o.code, o.status, o.orderedBy, o.at],
    );
  }
  async getOrder(id: OrderId): Promise<Order | null> {
    const r = await this.pool.query<OrderRow>("SELECT * FROM clinical.clinical_order WHERE id = $1", [id]);
    return r.rows[0] ? orderFrom(r.rows[0]) : null;
  }

  async saveResult(res: Result): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.result (id, order_id, patient_id, summary, abnormal, status, filed_at, acknowledged_by, released_to_patient, released_at, released_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, acknowledged_by=EXCLUDED.acknowledged_by, released_to_patient=EXCLUDED.released_to_patient, released_at=EXCLUDED.released_at, released_by=EXCLUDED.released_by`,
      [res.id, res.orderId, res.patientId, res.summary, res.abnormal, res.status, res.filedAt, res.acknowledgedBy, res.releasedToPatient, res.releasedAt, res.releasedBy],
    );
  }
  async getResult(id: ResultId): Promise<Result | null> {
    const r = await this.pool.query<ResultRow>("SELECT * FROM clinical.result WHERE id = $1", [id]);
    return r.rows[0] ? resultFrom(r.rows[0]) : null;
  }
  async unacknowledgedResults(): Promise<readonly Result[]> {
    const r = await this.pool.query<ResultRow>("SELECT * FROM clinical.result WHERE status = 'unacknowledged' ORDER BY filed_at");
    return r.rows.map(resultFrom);
  }
  async releasedResultsForPatient(patientId: string): Promise<readonly Result[]> {
    const r = await this.pool.query<ResultRow>("SELECT * FROM clinical.result WHERE patient_id = $1 AND released_to_patient = true ORDER BY filed_at", [patientId]);
    return r.rows.map(resultFrom);
  }

  async saveLetter(l: Letter): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.letter (id, patient_id, template_key, locale, body, status, signed_by, signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, signed_by=EXCLUDED.signed_by, signed_at=EXCLUDED.signed_at`,
      [l.id, l.patientId, l.templateKey, l.locale, l.body, l.status, l.signedBy, l.signedAt],
    );
  }
  async getLetter(id: LetterId): Promise<Letter | null> {
    const r = await this.pool.query<LetterRow>("SELECT * FROM clinical.letter WHERE id = $1", [id]);
    return r.rows[0] ? letterFrom(r.rows[0]) : null;
  }

  async saveAllergy(a: DrugAllergy): Promise<void> {
    await this.pool.query(
      `INSERT INTO clinical.drug_allergy (id, patient_id, drug_class, substance_ar, substance_en, severity, reaction, recorded_by, recorded_at, active, retired_by, retired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET active=EXCLUDED.active, retired_by=EXCLUDED.retired_by, retired_at=EXCLUDED.retired_at`,
      [a.id, a.patientId, a.drugClass, a.substance.ar, a.substance.en, a.severity, a.reaction, a.recordedBy, a.recordedAt, a.active, a.retiredBy, a.retiredAt],
    );
  }
  async getAllergy(id: DrugAllergyId): Promise<DrugAllergy | null> {
    const r = await this.pool.query<AllergyRow>("SELECT * FROM clinical.drug_allergy WHERE id = $1", [id]);
    return r.rows[0] ? allergyFrom(r.rows[0]) : null;
  }
  async activeAllergiesForPatient(patientId: string): Promise<readonly DrugAllergy[]> {
    const r = await this.pool.query<AllergyRow>("SELECT * FROM clinical.drug_allergy WHERE patient_id = $1 AND active = true ORDER BY recorded_at", [patientId]);
    return r.rows.map(allergyFrom);
  }
}

interface EncRow { id: string; patient_id: string; type: string; practitioner_id: string; status: string; opened_at: Date; closed_at: Date | null }
interface NoteRow { id: string; encounter_id: string; patient_id: string; versions: NoteVersion[] }
interface OrderRow { id: string; encounter_id: string; patient_id: string; kind: string; code: string; status: string; ordered_by: string; at: Date }
interface ResultRow { id: string; order_id: string; patient_id: string; summary: string; abnormal: boolean; status: string; filed_at: Date; acknowledged_by: string | null; released_to_patient: boolean; released_at: Date | null; released_by: string | null }
interface LetterRow { id: string; patient_id: string; template_key: string; locale: string; body: string; status: string; signed_by: string | null; signed_at: Date | null }
interface AllergyRow { id: string; patient_id: string; drug_class: string; substance_ar: string; substance_en: string; severity: string; reaction: string | null; recorded_by: string; recorded_at: Date; active: boolean; retired_by: string | null; retired_at: Date | null }

const encFrom = (r: EncRow): Encounter => ({ id: asId<"Encounter">(r.id), patientId: r.patient_id, type: r.type as Encounter["type"], practitionerId: r.practitioner_id, status: r.status as Encounter["status"], openedAt: new Date(r.opened_at).toISOString(), closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null });
const noteFrom = (r: NoteRow): ClinicalNote => ({ id: asId<"ClinicalNote">(r.id), encounterId: asId<"Encounter">(r.encounter_id), patientId: r.patient_id, versions: r.versions });
const orderFrom = (r: OrderRow): Order => ({ id: asId<"Order">(r.id), encounterId: asId<"Encounter">(r.encounter_id), patientId: r.patient_id, kind: r.kind as Order["kind"], code: r.code, status: r.status as Order["status"], orderedBy: r.ordered_by, at: new Date(r.at).toISOString() });
const resultFrom = (r: ResultRow): Result => ({ id: asId<"Result">(r.id), orderId: asId<"Order">(r.order_id), patientId: r.patient_id, summary: r.summary, abnormal: r.abnormal, status: r.status as Result["status"], filedAt: new Date(r.filed_at).toISOString(), acknowledgedBy: r.acknowledged_by, releasedToPatient: r.released_to_patient, releasedAt: r.released_at === null ? null : new Date(r.released_at).toISOString(), releasedBy: r.released_by });
const letterFrom = (r: LetterRow): Letter => ({ id: asId<"Letter">(r.id), patientId: r.patient_id, templateKey: r.template_key, locale: r.locale as Letter["locale"], body: r.body, status: r.status as Letter["status"], signedBy: r.signed_by, signedAt: r.signed_at ? new Date(r.signed_at).toISOString() : null });
const allergyFrom = (r: AllergyRow): DrugAllergy => ({ id: asId<"DrugAllergy">(r.id), patientId: r.patient_id, drugClass: r.drug_class, substance: { ar: r.substance_ar, en: r.substance_en }, severity: r.severity as DrugAllergy["severity"], reaction: r.reaction, recordedBy: r.recorded_by, recordedAt: new Date(r.recorded_at).toISOString(), active: r.active, retiredBy: r.retired_by, retiredAt: r.retired_at ? new Date(r.retired_at).toISOString() : null });
