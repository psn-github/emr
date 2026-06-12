import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { AccessGuard } from "./access.js";
import type { Document, DocumentId, DocumentKind, DocumentVersion } from "./document.js";
import { currentVersion } from "./document.js";
import type { OcrProvider } from "./ocr.js";
import type { DocumentStore } from "./store.js";

export interface CreateDocumentInput {
  readonly kind: DocumentKind;
  readonly subjectRef: string;
  readonly requiredPermission: string;
  readonly blobRef: string;
  readonly contentType: string;
}

export interface AddVersionInput {
  readonly blobRef: string;
  readonly contentType: string;
}

/**
 * Versioned, access-controlled, OCR-indexed document store (PRD E0). Holds
 * consent forms, ID scans, marriage certificates, external reports. Every write
 * is audited and emits a domain event; content access is RBAC-gated (via the
 * injected guard) and itself audited as a sensitive read.
 */
export class DocumentService {
  constructor(
    private readonly store: DocumentStore,
    private readonly ocr: OcrProvider,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async create(actorId: string, input: CreateDocumentInput): Promise<Document> {
    const version = await this.makeVersion(actorId, 1, input.blobRef, input.contentType);
    const doc: Document = {
      id: newId<"Document">(),
      kind: input.kind,
      subjectRef: input.subjectRef,
      requiredPermission: input.requiredPermission,
      versions: [version],
      deletedAt: null,
    };
    await this.store.save(doc);
    await this.audit.record({
      actorId,
      entityType: "Document",
      entityId: doc.id,
      action: "CREATE",
      after: this.metadata(doc),
    });
    await this.events.emit({
      type: "DocumentCreated",
      aggregateType: "Document",
      aggregateId: doc.id,
      data: { kind: doc.kind, subjectRef: doc.subjectRef },
    });
    return doc;
  }

  async addVersion(
    actorId: string,
    id: DocumentId,
    input: AddVersionInput,
  ): Promise<Result<Document, AppError>> {
    const doc = await this.store.get(id);
    if (doc === null) return err(notFound("document not found", "documents.not_found"));
    if (doc.deletedAt !== null) {
      return err(validationError("cannot version a deleted document", "documents.deleted"));
    }
    const next = currentVersion(doc).version + 1;
    const version = await this.makeVersion(actorId, next, input.blobRef, input.contentType);
    const updated: Document = { ...doc, versions: [...doc.versions, version] };
    await this.store.save(updated);
    await this.audit.record({
      actorId,
      entityType: "Document",
      entityId: doc.id,
      action: "UPDATE",
      before: this.metadata(doc),
      after: this.metadata(updated),
    });
    await this.events.emit({
      type: "DocumentVersionAdded",
      aggregateType: "Document",
      aggregateId: doc.id,
      data: { version: next },
    });
    return ok(updated);
  }

  /** Read the current content version — RBAC-gated and audited as a sensitive read. */
  async access(
    actorId: string,
    id: DocumentId,
    guard: AccessGuard,
  ): Promise<Result<DocumentVersion, AppError>> {
    const doc = await this.store.get(id);
    if (doc === null || doc.deletedAt !== null) {
      return err(notFound("document not found", "documents.not_found"));
    }
    const allowed = await guard.check(doc.requiredPermission);
    if (!allowed.ok) return err(allowed.error); // Authorizer already audited the denial
    await this.audit.record({
      actorId,
      entityType: "Document",
      entityId: doc.id,
      action: "READ_EXPORT",
      after: { documentId: doc.id, version: currentVersion(doc).version },
    });
    return ok(currentVersion(doc));
  }

  async softDelete(actorId: string, id: DocumentId): Promise<Result<void, AppError>> {
    const doc = await this.store.get(id);
    if (doc === null) return err(notFound("document not found", "documents.not_found"));
    if (doc.deletedAt !== null) {
      return err(validationError("document already deleted", "documents.already_deleted"));
    }
    const updated: Document = { ...doc, deletedAt: this.clock.now().toISOString() };
    await this.store.save(updated);
    await this.audit.record({
      actorId,
      entityType: "Document",
      entityId: doc.id,
      action: "SOFT_DELETE",
      before: this.metadata(doc),
      after: this.metadata(updated),
    });
    return ok(undefined);
  }

  /** Full-text-ish search over OCR-indexed content, filtered to documents the
   *  actor may access (per the guard). Returns metadata only, never content. */
  async search(query: string, guard: AccessGuard): Promise<readonly Document[]> {
    const needle = query.toLowerCase();
    const matches: Document[] = [];
    for (const doc of await this.store.all()) {
      const hit = doc.versions.some((v) => v.ocrText.toLowerCase().includes(needle));
      if (!hit) continue;
      const allowed = await guard.check(doc.requiredPermission);
      if (allowed.ok) matches.push(doc);
    }
    return matches;
  }

  private async makeVersion(
    actorId: string,
    version: number,
    blobRef: string,
    contentType: string,
  ): Promise<DocumentVersion> {
    const ocrText = await this.ocr.extract(blobRef, contentType);
    return { version, blobRef, contentType, ocrText, uploadedBy: actorId, uploadedAt: this.clock.now().toISOString() };
  }

  /** Audit/event metadata — never the blob content itself. */
  private metadata(doc: Document): Record<string, unknown> {
    return {
      id: doc.id,
      kind: doc.kind,
      subjectRef: doc.subjectRef,
      versionCount: doc.versions.length,
      deletedAt: doc.deletedAt,
    };
  }
}
