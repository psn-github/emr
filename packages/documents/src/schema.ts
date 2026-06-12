// Drizzle schema for the `documents` domain (ADR-0008). Versions are append-only
// (full history); soft-delete only. Blobs live in encrypted, in-region object
// storage — only the reference is stored here. `ocr_text` is the search index.
import { pgSchema, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const documentsSchema = pgSchema("documents");

export const document = documentsSchema.table(
  "document",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subjectRef: text("subject_ref").notNull(),
    requiredPermission: text("required_permission").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ bySubject: index("document_subject_idx").on(t.subjectRef) }),
);

export const documentVersion = documentsSchema.table(
  "document_version",
  {
    documentId: text("document_id").notNull(),
    version: integer("version").notNull(),
    blobRef: text("blob_ref").notNull(),
    contentType: text("content_type").notNull(),
    ocrText: text("ocr_text").notNull().default(""),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ uq: uniqueIndex("document_version_uq").on(t.documentId, t.version) }),
);
