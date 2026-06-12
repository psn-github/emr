import type { Document, DocumentId } from "./document.js";

/** Persistence boundary for documents. Postgres-backed impl (schema `documents`)
 *  lands with DB wiring; in-memory store backs the tests. */
export interface DocumentStore {
  save(doc: Document): Promise<void>;
  get(id: DocumentId): Promise<Document | null>;
  /** All non-deleted documents (for search). */
  all(): Promise<readonly Document[]>;
}

export class InMemoryDocumentStore implements DocumentStore {
  private readonly docs = new Map<string, Document>();

  async save(doc: Document): Promise<void> {
    this.docs.set(doc.id, doc);
  }
  async get(id: DocumentId): Promise<Document | null> {
    return this.docs.get(id) ?? null;
  }
  async all(): Promise<readonly Document[]> {
    return [...this.docs.values()].filter((d) => d.deletedAt === null);
  }
}
