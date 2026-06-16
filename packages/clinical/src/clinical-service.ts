import type { Clock, Result as R, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  ClinicalNote,
  Encounter,
  EncounterId,
  EncounterType,
  Letter,
  LetterId,
  NoteId,
  Order,
  OrderId,
  OrderKind,
  Result,
  ResultId,
} from "./types.js";
import type { ClinicalStore } from "./store.js";
import { InMemoryOrderSetStore, type OrderSetStore } from "./order-sets.js";
import type { OrderSet } from "./types.js";

/**
 * Clinical EMR core. Encounter notes are append-only (amendments add a version,
 * never overwrite); every mutation is audited and emits a domain event. All data
 * here is PHI — read/write is RBAC-gated at the API (clinical domain, MFA).
 */
export class ClinicalService {
  constructor(
    private readonly store: ClinicalStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    private readonly orderSets: OrderSetStore = new InMemoryOrderSetStore(),
  ) {}

  /** Available clinical pathways / order sets (config) for the order-entry UI. */
  listOrderSets(): Promise<readonly OrderSet[]> {
    return this.orderSets.listActive();
  }

  /** Apply a clinical pathway / order set to an encounter, placing all its orders
   *  at once (each a normal Order; audited individually + as a set application). */
  async applyOrderSet(actorId: string, encounterId: EncounterId, patientId: string, orderSetId: string): Promise<R<readonly Order[], AppError>> {
    const set = await this.orderSets.get(orderSetId);
    if (set === null || !set.active) return err(validationError(`unknown or inactive order set '${orderSetId}'`, "clinical.order_set.unknown"));
    const placed: Order[] = [];
    for (const item of set.items) {
      placed.push(await this.placeOrder(actorId, encounterId, patientId, item.kind, item.code));
    }
    await this.audit.record({ actorId, entityType: "Encounter", entityId: encounterId, action: "UPDATE", after: { orderSet: set.id, placed: placed.length } });
    await this.events.emit({ type: "OrderSetApplied", aggregateType: "Encounter", aggregateId: encounterId, data: { orderSet: set.id, count: placed.length } });
    return ok(placed);
  }

  async openEncounter(actorId: string, patientId: string, type: EncounterType, practitionerId: string): Promise<Encounter> {
    const enc: Encounter = {
      id: newId<"Encounter">(),
      patientId,
      type,
      practitionerId,
      status: "open",
      openedAt: this.clock.now().toISOString(),
      closedAt: null,
    };
    await this.store.saveEncounter(enc);
    await this.audit.record({ actorId, entityType: "Encounter", entityId: enc.id, action: "CREATE", after: { patientId, type } });
    await this.events.emit({ type: "EncounterOpened", aggregateType: "Encounter", aggregateId: enc.id, data: { patientId, type } });
    return enc;
  }

  async closeEncounter(actorId: string, id: EncounterId): Promise<R<Encounter, AppError>> {
    const enc = await this.store.getEncounter(id);
    if (enc === null) return err(notFound("encounter not found", "clinical.encounter.not_found"));
    if (enc.status === "closed") return err(validationError("encounter already closed", "clinical.encounter.closed"));
    const updated: Encounter = { ...enc, status: "closed", closedAt: this.clock.now().toISOString() };
    await this.store.saveEncounter(updated);
    await this.audit.record({ actorId, entityType: "Encounter", entityId: id, action: "UPDATE", before: { status: "open" }, after: { status: "closed" } });
    return ok(updated);
  }

  /** Write the first version of an encounter note. */
  async writeNote(actorId: string, encounterId: EncounterId, patientId: string, body: Record<string, unknown>): Promise<ClinicalNote> {
    const note: ClinicalNote = {
      id: newId<"ClinicalNote">(),
      encounterId,
      patientId,
      versions: [{ version: 1, body, authorId: actorId, at: this.clock.now().toISOString() }],
    };
    await this.store.saveNote(note);
    await this.audit.record({ actorId, entityType: "ClinicalNote", entityId: note.id, action: "CREATE", after: { encounterId, version: 1 } });
    await this.events.emit({ type: "ClinicalNoteWritten", aggregateType: "ClinicalNote", aggregateId: note.id, data: { encounterId } });
    return note;
  }

  /** Amend a note — APPEND-ONLY: prior versions are retained, never overwritten. */
  async amendNote(actorId: string, id: NoteId, body: Record<string, unknown>): Promise<R<ClinicalNote, AppError>> {
    const note = await this.store.getNote(id);
    if (note === null) return err(notFound("note not found", "clinical.note.not_found"));
    const nextVersion = note.versions[note.versions.length - 1]!.version + 1;
    const updated: ClinicalNote = {
      ...note,
      versions: [...note.versions, { version: nextVersion, body, authorId: actorId, at: this.clock.now().toISOString() }],
    };
    await this.store.saveNote(updated);
    await this.audit.record({ actorId, entityType: "ClinicalNote", entityId: id, action: "UPDATE", before: { versions: note.versions.length }, after: { versions: updated.versions.length } });
    await this.events.emit({ type: "ClinicalNoteAmended", aggregateType: "ClinicalNote", aggregateId: id, data: { version: nextVersion } });
    return ok(updated);
  }

  async placeOrder(actorId: string, encounterId: EncounterId, patientId: string, kind: OrderKind, code: string): Promise<Order> {
    const order: Order = { id: newId<"Order">(), encounterId, patientId, kind, code, status: "ordered", orderedBy: actorId, at: this.clock.now().toISOString() };
    await this.store.saveOrder(order);
    await this.audit.record({ actorId, entityType: "Order", entityId: order.id, action: "CREATE", after: { kind, code } });
    await this.events.emit({ type: "OrderPlaced", aggregateType: "Order", aggregateId: order.id, data: { kind, code } });
    return order;
  }

  /** File a result against an order; lands in the results inbox unacknowledged. */
  async fileResult(actorId: string, orderId: OrderId, summary: string, abnormal: boolean): Promise<R<Result, AppError>> {
    const order = await this.store.getOrder(orderId);
    if (order === null) return err(notFound("order not found", "clinical.order.not_found"));
    const result: Result = { id: newId<"Result">(), orderId, patientId: order.patientId, summary, abnormal, status: "unacknowledged", filedAt: this.clock.now().toISOString(), acknowledgedBy: null, releasedToPatient: false, releasedAt: null, releasedBy: null };
    await this.store.saveResult(result);
    await this.store.saveOrder({ ...order, status: "resulted" });
    await this.audit.record({ actorId, entityType: "Result", entityId: result.id, action: "CREATE", after: { orderId, abnormal } });
    await this.events.emit({ type: "ResultFiled", aggregateType: "Result", aggregateId: result.id, data: { orderId, abnormal } });
    return ok(result);
  }

  /** Clinician acknowledges/actions a result (closes the inbox loop). */
  async acknowledgeResult(actorId: string, id: ResultId): Promise<R<Result, AppError>> {
    const result = await this.store.getResult(id);
    if (result === null) return err(notFound("result not found", "clinical.result.not_found"));
    if (result.status === "acknowledged") return err(validationError("already acknowledged", "clinical.result.acknowledged"));
    const updated: Result = { ...result, status: "acknowledged", acknowledgedBy: actorId };
    await this.store.saveResult(updated);
    const order = await this.store.getOrder(result.orderId);
    if (order !== null) await this.store.saveOrder({ ...order, status: "acknowledged" });
    await this.audit.record({ actorId, entityType: "Result", entityId: id, action: "UPDATE", before: { status: "unacknowledged" }, after: { status: "acknowledged" } });
    return ok(updated);
  }

  /** Clinician releases a result to the patient portal (ADR-0042): until released,
   *  a result is invisible to the patient. Idempotency-guarded. */
  async releaseResult(actorId: string, id: ResultId): Promise<R<Result, AppError>> {
    const result = await this.store.getResult(id);
    if (result === null) return err(notFound("result not found", "clinical.result.not_found"));
    if (result.releasedToPatient) return err(validationError("already released", "clinical.result.released"));
    const updated: Result = { ...result, releasedToPatient: true, releasedAt: this.clock.now().toISOString(), releasedBy: actorId };
    await this.store.saveResult(updated);
    await this.audit.record({ actorId, entityType: "Result", entityId: id, action: "UPDATE", before: { releasedToPatient: false }, after: { releasedToPatient: true } });
    await this.events.emit({ type: "ResultReleasedToPatient", aggregateType: "Result", aggregateId: id, data: { patientId: result.patientId } });
    return ok(updated);
  }

  resultsInbox(): Promise<readonly Result[]> {
    return this.store.unacknowledgedResults();
  }

  /** Results released to a patient (the portal read; caller enforces own-data). */
  releasedResultsForPatient(patientId: string): Promise<readonly Result[]> {
    return this.store.releasedResultsForPatient(patientId);
  }

  async draftLetter(actorId: string, patientId: string, templateKey: string, locale: "en" | "ar", body: string): Promise<Letter> {
    const letter: Letter = { id: newId<"Letter">(), patientId, templateKey, locale, body, status: "draft", signedBy: null, signedAt: null };
    await this.store.saveLetter(letter);
    await this.audit.record({ actorId, entityType: "Letter", entityId: letter.id, action: "CREATE", after: { templateKey, locale } });
    return letter;
  }

  /** E-sign a letter. */
  async signLetter(actorId: string, id: LetterId): Promise<R<Letter, AppError>> {
    const letter = await this.store.getLetter(id);
    if (letter === null) return err(notFound("letter not found", "clinical.letter.not_found"));
    if (letter.status === "signed") return err(validationError("letter already signed", "clinical.letter.signed"));
    const updated: Letter = { ...letter, status: "signed", signedBy: actorId, signedAt: this.clock.now().toISOString() };
    await this.store.saveLetter(updated);
    await this.audit.record({ actorId, entityType: "Letter", entityId: id, action: "UPDATE", before: { status: "draft" }, after: { status: "signed" } });
    await this.events.emit({ type: "LetterSigned", aggregateType: "Letter", aggregateId: id, data: { patientId: letter.patientId } });
    return ok(updated);
  }

  getNote(id: NoteId): Promise<ClinicalNote | null> {
    return this.store.getNote(id);
  }
}
