-- 0001_documents — versioned, access-controlled document store (ADR-0067). Holds
-- scanned paper (consents, marriage certificates, ID scans, external reports)
-- linked to a subject (person/couple/cycle). Forward-only, additive (ADR-0008);
-- IF NOT EXISTS keeps it re-runnable. Versions are APPEND-ONLY (full history) and
-- documents are SOFT-DELETED only — there is deliberately no DROP/DELETE path
-- anywhere here (append-only / soft-state, docs/PATIENT-DATA.md). Blobs live in
-- the in-region object store (staging: local disk); only the reference is stored.

CREATE SCHEMA IF NOT EXISTS documents;

-- One logical document. `required_permission` is the RBAC gate the API enforces
-- via the injected AccessGuard (documents stays decoupled from the identity
-- module). `deleted_at` is the soft-delete tombstone — never a hard delete.
CREATE TABLE IF NOT EXISTS documents.document (
  id                  text PRIMARY KEY,
  kind                text NOT NULL,
  subject_ref         text NOT NULL,
  required_permission text NOT NULL,
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS document_subject_idx ON documents.document (subject_ref);

-- One immutable version of a document's content (append-only full history).
-- `ocr_text` is the search index (empty until a real OCR provider is wired).
CREATE TABLE IF NOT EXISTS documents.document_version (
  document_id  text NOT NULL,
  version      integer NOT NULL,
  blob_ref     text NOT NULL,
  content_type text NOT NULL,
  ocr_text     text NOT NULL DEFAULT '',
  uploaded_by  text NOT NULL,
  uploaded_at  timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS document_version_uq ON documents.document_version (document_id, version);
