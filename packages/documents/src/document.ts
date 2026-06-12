import type { Id } from "@oxford/core";

export type DocumentId = Id<"Document">;

/** What a document is. Drives default access policy and retention. */
export type DocumentKind =
  | "consent"
  | "id_scan"
  | "marriage_certificate"
  | "external_report"
  | "letter"
  | "other";

/** One immutable version of a document's content. New uploads append a version;
 *  prior versions are never overwritten (append-only / full version history). */
export interface DocumentVersion {
  readonly version: number;
  /** Opaque reference into encrypted blob storage (in-region). */
  readonly blobRef: string;
  readonly contentType: string;
  /** OCR-extracted text for indexing/search (empty if not yet processed). */
  readonly ocrText: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

export interface Document {
  readonly id: DocumentId;
  readonly kind: DocumentKind;
  /** Logical reference to the owning entity, e.g. "Person:<id>" / "Couple:<id>". */
  readonly subjectRef: string;
  /** Permission required to read this document. Enforced by the caller via the
   *  injected AccessGuard — documents stays decoupled from the identity module. */
  readonly requiredPermission: string;
  readonly versions: readonly DocumentVersion[];
  readonly deletedAt: string | null;
}

export function currentVersion(doc: Document): DocumentVersion {
  // A document always has at least one version (enforced at creation).
  return doc.versions[doc.versions.length - 1]!;
}
