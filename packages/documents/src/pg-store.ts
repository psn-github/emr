import type { Pool } from "pg";
import type { Document, DocumentId, DocumentKind, DocumentVersion } from "./document.js";
import type { DocumentStore } from "./store.js";

/** Postgres-backed DocumentStore (schema `documents`). The document row carries
 *  the metadata + soft-state; versions are append-only (immutable, insert-once).
 *  Blobs live in the BlobStorePort — only the `blob_ref` is persisted here. */
export class PgDocumentStore implements DocumentStore {
  constructor(private readonly pool: Pool) {}

  async save(doc: Document): Promise<void> {
    // Metadata upserts (create sets it; softDelete flips deleted_at). Versions are
    // append-only: insert each, ON CONFLICT DO NOTHING keeps prior versions immutable.
    await this.pool.query(
      `INSERT INTO documents.document (id, kind, subject_ref, required_permission, deleted_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
      [doc.id, doc.kind, doc.subjectRef, doc.requiredPermission, doc.deletedAt],
    );
    for (const v of doc.versions) {
      await this.pool.query(
        `INSERT INTO documents.document_version (document_id, version, blob_ref, content_type, ocr_text, uploaded_by, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (document_id, version) DO NOTHING`,
        [doc.id, v.version, v.blobRef, v.contentType, v.ocrText, v.uploadedBy, v.uploadedAt],
      );
    }
  }

  async get(id: DocumentId): Promise<Document | null> {
    const d = await this.pool.query<DocRow>("SELECT * FROM documents.document WHERE id = $1", [id]);
    const row = d.rows[0];
    if (!row) return null;
    return docFrom(row, await this.versionsFor(id));
  }

  async all(): Promise<readonly Document[]> {
    const d = await this.pool.query<DocRow>(
      "SELECT * FROM documents.document WHERE deleted_at IS NULL ORDER BY id",
    );
    return Promise.all(d.rows.map(async (row) => docFrom(row, await this.versionsFor(row.id))));
  }

  async bySubject(subjectRef: string): Promise<readonly Document[]> {
    const d = await this.pool.query<DocRow>(
      "SELECT * FROM documents.document WHERE subject_ref = $1 AND deleted_at IS NULL ORDER BY id",
      [subjectRef],
    );
    return Promise.all(d.rows.map(async (row) => docFrom(row, await this.versionsFor(row.id))));
  }

  private async versionsFor(id: string): Promise<DocumentVersion[]> {
    const v = await this.pool.query<VersionRow>(
      "SELECT * FROM documents.document_version WHERE document_id = $1 ORDER BY version",
      [id],
    );
    return v.rows.map(versionFrom);
  }
}

interface DocRow {
  id: string;
  kind: string;
  subject_ref: string;
  required_permission: string;
  deleted_at: Date | null;
}
interface VersionRow {
  document_id: string;
  version: number;
  blob_ref: string;
  content_type: string;
  ocr_text: string;
  uploaded_by: string;
  uploaded_at: Date;
}

function docFrom(row: DocRow, versions: readonly DocumentVersion[]): Document {
  return {
    id: row.id as DocumentId,
    kind: row.kind as DocumentKind,
    subjectRef: row.subject_ref,
    requiredPermission: row.required_permission,
    versions,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at).toISOString(),
  };
}

function versionFrom(row: VersionRow): DocumentVersion {
  return {
    version: Number(row.version),
    blobRef: row.blob_ref,
    contentType: row.content_type,
    ocrText: row.ocr_text,
    uploadedBy: row.uploaded_by,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
  };
}
