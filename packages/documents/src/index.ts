// @oxford/documents — versioned, access-controlled, OCR-indexed document store.
// Platform package (depends on audit + core).
export type {
  Document,
  DocumentId,
  DocumentKind,
  DocumentVersion,
} from "./document.js";
export { currentVersion } from "./document.js";
export { type OcrProvider, NoopOcrProvider } from "./ocr.js";
export { type AccessGuard, allowAllGuard } from "./access.js";
export { type DocumentStore, InMemoryDocumentStore } from "./store.js";
export { PgDocumentStore } from "./pg-store.js";
export {
  type BlobData,
  type BlobStorePort,
  type LocalDiskBlobStoreOptions,
  LocalDiskBlobStore,
} from "./blob-store.js";
export {
  DocumentService,
  type CreateDocumentInput,
  type AddVersionInput,
} from "./document-service.js";
export { documentsSchema, document, documentVersion } from "./schema.js";
